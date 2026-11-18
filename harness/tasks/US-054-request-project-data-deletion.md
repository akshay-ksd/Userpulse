# US-054 — Request project data deletion

| Field | Value |
|---|---|
| **Story ID** | US-054 |
| **Epic** | EP-11 Privacy, Security, Operations |
| **Priority** | P0 |
| **Milestone** | M9 — Security and Pilot Readiness |
| **Source** | `harness/user-stories.md` §US-054 |
| **Status** | Done |
| **Created** | 2026-11-18 |

## Story

**As an** organization owner, **I want** to request deletion of project data, **so that** data can be removed when no longer required.

## Acceptance criteria

- [ ] An authorized owner can request deletion.
- [ ] Scope and consequences are explained before confirmation.
- [ ] The request is recorded and its status is visible.
- [ ] Applicable data is removed from relevant stores, queues, and artifacts according to policy.
- [ ] Completion or failure is recorded.
- [ ] Backup-retention exceptions are documented.

## Story review

**Scope:** This story requires:
1. A `DataDeletionRequest` model to record deletion requests with status tracking.
2. API endpoints for owners to create deletion requests and view their status.
3. A background job that processes pending deletion requests — deleting events, recommendations, analysis runs, funnels, feature mappings, features, API keys, and analysis schedules for the target project.
4. A confirmation endpoint (two-step: request → confirm) to ensure scope and consequences are understood.
5. An internal metrics endpoint for observability.

**What's in scope:**
- Database model for deletion requests
- API to create, confirm, list, and view deletion requests (org owner only)
- Background job to process confirmed deletions (delete project data in correct order)
- Metrics/observability for deletion processing
- Response includes scope description and consequences before confirmation
- Backup-retention exception documented in API response

**What's out of scope:**
- ClickHouse data deletion (MVP uses PostgreSQL only)
- S3 artifact deletion (no S3 artifacts exist yet)
- Deleting the project record itself (only its data — events, analytics artifacts, recommendations)
- UI page for deletion (API only; web can be added later)
- Undo/recovery after deletion completes

**Decisions:**
- Two-step flow: `POST .../data-deletion` creates a PENDING request, `POST .../data-deletion/:id/confirm` starts processing. This ensures the owner sees scope/consequences before committing.
- Deletion is per-project, not per-organization (more granular control).
- Background processing via `@Interval` (same pattern as event processor) to handle potentially large deletes.
- Data deleted: events, recommendation status history, recommendations, analysis runs, analysis schedules, funnel steps, funnels, feature event mappings, features, API keys for the project.
- The project record itself is NOT deleted — it remains as a shell with status ARCHIVED.
- Deletion order respects FK constraints (child records first).

## Current codebase state

- `Project` model with relations to: `ProjectApiKey`, `Feature`, `FeatureEventMapping`, `Funnel` (→ `FunnelStep`), `AnalysisRun` (→ `Recommendation` → `RecommendationStatusHistory`), `AnalysisSchedule`, `Event`.
- All project-related models have `onDelete: Cascade` from Project, but we use explicit deletion for auditability and batching.
- `RetentionModule` exists with `RetentionCleanupService` as pattern for background deletion.
- `EventProcessorService` uses `@Interval(5000)` as another background job pattern.
- `ScheduleModule.forRoot()` already registered in `AppModule`.
- `GET /internal/metrics/processing` and `GET /internal/metrics/retention` patterns exist.
- Organization OWNER role enforcement pattern in `RetentionService.updateRetentionSettings()`.
- Membership verification pattern in `ProjectsService.verifyMembership()`.
- No deletion request model or endpoints exist.

## Dependencies

**Upstream (must be Done):**
- US-009 (Create a project) — Done. Project model exists.
- US-053 (Understand data retention) — Done. Retention infrastructure exists.
- US-021 (Submit an event batch) — Done. Event model exists.
- US-041–US-046 (AI Recommendations) — Done. Recommendation/AnalysisRun models exist.

**Downstream (depends on this):**
- None.

## Implementation subtasks

### 1. Database — DataDeletionRequest model

- [ ] Add `DataDeletionRequest` model to `packages/database/prisma/schema.prisma`:
  ```
  model DataDeletionRequest {
    id              String    @id @default(uuid())
    projectId       String
    organizationId  String
    requestedBy     String
    status          String    @default("PENDING")
    scope           Json
    eventsDeleted   Int       @default(0)
    recordsDeleted  Int       @default(0)
    error           String?
    confirmedAt     DateTime? @db.Timestamptz(6)
    startedAt       DateTime? @db.Timestamptz(6)
    completedAt     DateTime? @db.Timestamptz(6)
    createdAt       DateTime  @default(now()) @db.Timestamptz(6)
    updatedAt       DateTime  @updatedAt

    @@index([projectId, status])
    @@index([status, createdAt])
    @@map("data_deletion_requests")
  }
  ```
  Status values: PENDING, CONFIRMED, PROCESSING, COMPLETED, FAILED.
  `scope` is a JSON object describing what will be deleted (counts of events, recommendations, etc.).
- [ ] Run `npx prisma migrate dev --name add_data_deletion_requests`.

### 2. API — DataDeletionModule

- [ ] Create `apps/api/src/data-deletion/data-deletion.module.ts` — NestJS module registering service, processor, and controllers.
- [ ] Create `apps/api/src/data-deletion/data-deletion.service.ts`:
  - `createRequest(orgId, projectId, userId)` — Verifies OWNER role, checks no active request exists for this project, computes scope (counts of records to be deleted), creates PENDING request with scope.
  - `confirmRequest(orgId, requestId, userId)` — Verifies OWNER role, checks request is PENDING, sets status to CONFIRMED and confirmedAt.
  - `listRequests(orgId, userId)` — Verifies membership, returns requests for the org.
  - `getRequest(orgId, requestId, userId)` — Verifies membership, returns single request with scope details.
  - `cancelRequest(orgId, requestId, userId)` — Verifies OWNER role, cancels PENDING request.
  Private helper: `computeScope(projectId)` — counts events, recommendations, analysis runs, funnels, features, API keys, feature mappings, analysis schedules.
- [ ] Create `apps/api/src/data-deletion/data-deletion.controller.ts`:
  - `POST /organizations/:orgId/projects/:projectId/data-deletion` (201) — Creates deletion request. Returns scope and consequences. OWNER only.
  - `POST /organizations/:orgId/data-deletion/:requestId/confirm` (200) — Confirms and starts processing. OWNER only.
  - `GET /organizations/:orgId/data-deletion` (200) — Lists all deletion requests for the org. Any member.
  - `GET /organizations/:orgId/data-deletion/:requestId` (200) — Gets single request. Any member.
  - `DELETE /organizations/:orgId/data-deletion/:requestId` (204) — Cancels pending request. OWNER only.
- [ ] Register `DataDeletionModule` in `AppModule`.

### 3. API — DataDeletionProcessorService (background job)

- [ ] Create `apps/api/src/data-deletion/data-deletion-processor.service.ts`:
  - `@Interval(10000)` — polls for CONFIRMED requests.
  - For each CONFIRMED request: sets status to PROCESSING, then deletes data in FK-safe order:
    1. `RecommendationStatusHistory` where recommendation.projectId = projectId
    2. `Recommendation` where projectId = projectId
    3. `AnalysisRun` where projectId = projectId
    4. `AnalysisSchedule` where projectId = projectId
    5. `FunnelStep` where funnel.projectId = projectId
    6. `Funnel` where projectId = projectId
    7. `FeatureEventMapping` where projectId = projectId
    8. `Feature` where projectId = projectId
    9. `Event` where projectId = projectId (batched, 1000 at a time)
    10. `ProjectApiKey` where projectId = projectId
  - After deletion: sets project status to ARCHIVED, updates request with counts, sets status COMPLETED, completedAt.
  - On error: sets status FAILED with error message.
  - Track metrics: last run, requests processed, errors.
- [ ] Create `GET /internal/metrics/data-deletion` endpoint (in a metrics controller):
  - Returns: last run time, requests processed, errors, pending request count.

### 4. API — Response shape for scope and consequences

The create endpoint response includes:
```json
{
  "id": "...",
  "projectId": "...",
  "status": "PENDING",
  "scope": {
    "events": 1234,
    "recommendations": 5,
    "analysisRuns": 2,
    "funnels": 1,
    "features": 3,
    "featureEventMappings": 7,
    "apiKeys": 2,
    "analysisSchedules": 1
  },
  "consequences": "This will permanently delete all tracked events, recommendations, analysis runs, funnels, features, feature mappings, API keys, and analysis schedules for this project. The project will be archived. This action cannot be undone. Note: data may persist in database backups according to the infrastructure backup retention policy.",
  "createdAt": "..."
}
```

### 5. Tests

- [ ] Unit tests for `DataDeletionService`:
  - `createRequest` — creates PENDING request with correct scope.
  - `createRequest` — rejects non-owner (403).
  - `createRequest` — rejects non-member (404).
  - `createRequest` — rejects when active request exists (409).
  - `confirmRequest` — sets CONFIRMED.
  - `confirmRequest` — rejects non-PENDING request (400).
  - `cancelRequest` — cancels PENDING request.
  - `listRequests` — returns org requests.
  - `getRequest` — returns single request.
- [ ] Unit tests for `DataDeletionProcessorService`:
  - `processNextRequest` — processes CONFIRMED request, deletes data.
  - `processNextRequest` — handles errors, sets FAILED.
  - `processNextRequest` — skips when no CONFIRMED requests.
  - `getMetrics` — returns metrics.
- [ ] E2E tests for endpoints:
  - `POST .../data-deletion` — 201, 403 non-owner, 404 non-member, 401 unauthenticated.
  - `POST .../confirm` — 200, 400 non-pending.
  - `GET .../data-deletion` — 200, 401.
  - `DELETE .../data-deletion/:id` — 204, 403 non-owner.

## Verification

```bash
pnpm --filter api test          # Unit tests
pnpm --filter api test:e2e      # E2E tests (if PostgreSQL available)
pnpm lint                       # Lint
pnpm typecheck                  # Type check
pnpm build                      # Build
pnpm format:check               # Format
```

## Definition of Done

- [ ] Authorized owner can request project data deletion via API.
- [ ] Scope and consequences are returned before confirmation.
- [ ] Request is recorded with status tracking (PENDING → CONFIRMED → PROCESSING → COMPLETED/FAILED).
- [ ] Background processor deletes project data from all relevant tables.
- [ ] Completion/failure recorded on the request.
- [ ] Backup-retention exception documented in consequences text.
- [ ] Tests are written and passing.
- [ ] Lint, typecheck, build pass.
- [ ] No unrelated changes.

## Assumptions

- Per-project deletion (not per-organization) is the right granularity.
- Two-step flow (request + confirm) satisfies the "scope and consequences explained before confirmation" criterion.
- The project record itself is preserved (archived) after data deletion for auditability.
- Only one active deletion request per project at a time (PENDING, CONFIRMED, or PROCESSING).
- Backup-retention exception: a text note that backups may retain data beyond deletion, per infrastructure policy.
- Event deletion is batched (1000 at a time) to avoid long-running transactions.
