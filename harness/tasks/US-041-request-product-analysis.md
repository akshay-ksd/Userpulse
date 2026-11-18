# US-041 — Request product analysis

- **Epic:** EP-09 AI Recommendations
- **Priority:** P0 (M7 — AI Recommendation Engine)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-17)
- **Created:** 2026-11-17

## Story

> **As a** project administrator, **I want** to request an analysis, **so that** I can receive updated insights and recommendations.

## Acceptance criteria

- [x] An authorized user can request analysis for a project.
- [x] The request is associated with the correct tenant and project.
- [x] An analysis-run record is created.
- [x] Queued, running, completed, and failed statuses are visible.
- [x] Insufficient data is communicated clearly.

## Story review

**Scope boundary:** This story covers the analysis-run lifecycle — creating, tracking, and viewing the status of analysis runs. The actual AI analysis (Bedrock integration, recommendation generation) is US-042 scope; this story establishes the run infrastructure.

**Key decisions:**

- **Data model:** New `AnalysisRun` Prisma model in PostgreSQL. Runs are project-scoped. Statuses: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `INSUFFICIENT_DATA`. The model tracks timestamps for each state transition.
- **Execution model:** For MVP, analysis runs synchronously within the request handler (marks RUNNING, executes, marks COMPLETED/FAILED). The architecture calls for EventBridge-triggered async processing, but MVP uses a simpler approach: the POST endpoint creates a QUEUED record, then a background processor (using `@nestjs/schedule` Interval, same pattern as `EventProcessorService`) picks it up. This avoids blocking the HTTP request.
- **Insufficient data check:** Before running analysis, check that the project has a minimum number of valid processed events (e.g., ≥10 events in the analysis period). If not, mark as `INSUFFICIENT_DATA` with a clear message.
- **Analysis period:** Default to the last 30 days. The period is stored on the run record.
- **API pattern:** Follows the established `FeaturesController`/`FunnelsController` pattern — nested under `organizations/:orgId/projects/:projectId/analysis-runs`.
- **Authorization:** Any org member can request analysis (not restricted to OWNER). Follows same membership check pattern.
- **Concurrency:** Only one QUEUED or RUNNING analysis per project at a time. Reject with 409 if one is already in progress.

**Out of scope:**
- AI/Bedrock integration (US-042)
- Recommendation generation (US-042)
- Evidence inspection (US-043)
- Confidence/impact scoring (US-044)
- Duplicate detection (US-045)
- Scheduled analysis (US-046)

## Current codebase state (verified 2026-11-17)

- **Prisma schema** (`packages/database/prisma/schema.prisma`): No `AnalysisRun` model. Existing models: `Event` (with `processingStatus`, `validationStatus`), `Feature`, `FeatureEventMapping`, `Funnel`, `FunnelStep`, `Project`, `Organization`, `OrganizationMember`.
- **API modules** (`apps/api/src/`): `FunnelsModule` and `FeaturesModule` are the closest CRUD patterns. `AnalyticsModule` provides read-only analytics queries (event activity, active users, feature adoption, etc.). `EventProcessorModule` shows the background processing pattern with `@Interval`.
- **Web** (`apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`): Large project workspace page with inline sections (TrackingCredentials, FeaturesSection, FunnelsSection, AnalyticsSection, InsightsSection).
- **No analysis-run code exists** — this is greenfield for EP-09.

## Dependencies

- **Upstream:** US-009 (Done — projects), US-021–025 (Done — event ingestion/processing), US-026–029 (Done — features), US-030–040 (Done — analytics/insights). All satisfied.
- **Downstream:** US-042 (recommendation generation) depends on the analysis-run infrastructure from this story. US-043–046 also build on this.

## Implementation subtasks

### 1. Database — Add AnalysisRun model

- [x] In `packages/database/prisma/schema.prisma`:
  - Add `AnalysisRun` model:
    - `id` String @id @default(uuid())
    - `projectId` String (FK to Project)
    - `organizationId` String
    - `requestedById` String (the user who triggered the run)
    - `status` String @default("QUEUED") — values: QUEUED, RUNNING, COMPLETED, FAILED, INSUFFICIENT_DATA
    - `periodStart` DateTime @db.Timestamptz(6) — start of the analysis window
    - `periodEnd` DateTime @db.Timestamptz(6) — end of the analysis window
    - `eventCount` Int? — total valid events found in the period (populated during execution)
    - `statusMessage` String? — human-readable status detail (e.g., insufficient data reason, error message)
    - `startedAt` DateTime? @db.Timestamptz(6) — when processing began
    - `completedAt` DateTime? @db.Timestamptz(6) — when processing finished (success or failure)
    - `createdAt` DateTime @default(now()) @db.Timestamptz(6)
    - `updatedAt` DateTime @updatedAt
  - Add relation: `project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)`
  - Add `analysisRuns AnalysisRun[]` relation on `Project` model
  - Indexes: `(projectId, status)`, `(projectId, createdAt)`
  - Map to `analysis_runs`
- [x] Run `npx prisma migrate dev --name add_analysis_runs` from `packages/database/`. (Manual migration + prisma generate)
- [x] Run `pnpm --filter @userpulse/database build` to regenerate the Prisma client.

### 2. API — Create AnalysisRunsModule with DTOs

- [x] Create `apps/api/src/analysis-runs/analysis-runs.module.ts`:
  - Import `PrismaModule`, `AnalyticsModule` (for event count queries).
  - Declare `AnalysisRunsController`, provide `AnalysisRunsService`, `AnalysisRunProcessorService`.
  - Export `AnalysisRunsService`.
- [x] Create `apps/api/src/analysis-runs/request-analysis.dto.ts`:
  - Zod schema: optional `periodStart` (ISO date string), optional `periodEnd` (ISO date string). Defaults: `periodStart` = 30 days ago, `periodEnd` = now.
  - Validate `periodStart < periodEnd`, period not longer than 90 days, `periodEnd` not in the future (allow 1 hour tolerance).
  - Export `requestAnalysisSchema` and `RequestAnalysisDto` type.
- [x] Register `AnalysisRunsModule` in `apps/api/src/app.module.ts`.

### 3. API — Implement AnalysisRunsService

- [x] Create `apps/api/src/analysis-runs/analysis-runs.service.ts`:
  - `private async verifyProjectAccess(orgId, projectId, userId)` — same pattern as FunnelsService/FeaturesService.
  - `async requestAnalysis(orgId, projectId, userId, dto)`:
    1. Verify project access.
    2. Check no QUEUED or RUNNING run exists for this project (prisma.analysisRun.findFirst). If one exists, throw `ConflictException` (409) with message "An analysis is already in progress for this project."
    3. Create `AnalysisRun` record with status QUEUED, periodStart, periodEnd, requestedById, organizationId, projectId.
    4. Return the created run.
  - `async findByProject(orgId, projectId, userId)`:
    1. Verify project access.
    2. Return all runs for the project, ordered by `createdAt` DESC, with limited fields (id, status, periodStart, periodEnd, eventCount, statusMessage, startedAt, completedAt, createdAt).
  - `async findOne(orgId, projectId, runId, userId)`:
    1. Verify project access.
    2. Find the run by id and projectId. Throw `NotFoundException` if not found.
    3. Return full run details.

### 4. API — Implement AnalysisRunProcessorService (background processing)

- [x] Create `apps/api/src/analysis-runs/analysis-run-processor.service.ts`:
  - Use `@Interval(10000)` (10 seconds) to poll for QUEUED runs.
  - `async processNextRun()`:
    1. Find the oldest QUEUED run (`SELECT ... FOR UPDATE SKIP LOCKED` pattern from EventProcessorService).
    2. Mark it RUNNING with `startedAt = now()`.
    3. Count valid processed events in the project for the period: `prisma.event.count({ where: { projectId, validationStatus: 'VALID', processingStatus: 'PROCESSED', eventTimestamp: { gte: periodStart, lte: periodEnd } } })`.
    4. If `eventCount < 10`, mark as `INSUFFICIENT_DATA` with statusMessage "Insufficient data: only {N} valid events found in the analysis period. At least 10 events are required."
    5. If sufficient data, mark as COMPLETED with `eventCount` and `completedAt = now()`. (Actual AI analysis is US-042 scope — for now, the run just validates data sufficiency.)
    6. On error, mark as FAILED with the error message in `statusMessage`.

### 5. API — Implement AnalysisRunsController

- [x] Create `apps/api/src/analysis-runs/analysis-runs.controller.ts`:
  - `@Controller('organizations/:orgId/projects/:projectId/analysis-runs')`
  - `@Post()` — request a new analysis. `@Body({ schema: requestAnalysisSchema })`. Returns 201 with the created run.
  - `@Get()` — list runs for the project. Returns array of runs.
  - `@Get(':runId')` — get a specific run. Returns full run details. 404 if not found.

### 6. Web — Add AnalysisSection to project workspace

- [x] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add `AnalysisRunsSection` inline component (following FeaturesSection/FunnelsSection pattern).
  - Display a "Request Analysis" button.
  - When clicked, POST to `/organizations/:orgId/projects/:projectId/analysis-runs`.
  - Show the list of analysis runs with: status badge (color-coded: QUEUED=yellow, RUNNING=blue, COMPLETED=green, FAILED=red, INSUFFICIENT_DATA=orange), period, event count, status message, timestamps.
  - Auto-refresh the list every 10 seconds while any run is QUEUED or RUNNING (using `setInterval`).
  - Show clear messaging for INSUFFICIENT_DATA: "Not enough data to analyze. Ensure your project is tracking events before requesting analysis."
  - Disable the "Request Analysis" button when a run is QUEUED or RUNNING.

### 7. Tests — Unit tests

- [x] Create `apps/api/src/analysis-runs/__tests__/analysis-runs.service.spec.ts`:
  - Test `requestAnalysis`: happy path (creates QUEUED run), conflict (409 when run in progress), project access denied.
  - Test `findByProject`: returns runs ordered by createdAt DESC, empty list, project access denied.
  - Test `findOne`: happy path, not found (404), project access denied.
- [x] Create `apps/api/src/analysis-runs/__tests__/analysis-run-processor.service.spec.ts`:
  - Test `processNextRun`: picks up QUEUED run, marks RUNNING then COMPLETED with event count. Insufficient data path (<10 events). Error handling (FAILED status). No QUEUED runs (no-op). SKIP LOCKED behavior.
- [x] Create `apps/api/src/analysis-runs/__tests__/request-analysis.dto.spec.ts`:
  - Test Zod schema: valid defaults, custom dates, invalid date range, period too long, future end date.

### 8. Tests — E2E tests

- [x] Create `apps/api/src/analysis-runs/__tests__/analysis-runs.e2e-spec.ts`:
  - POST: 201 (creates run), 409 (concurrent run), 401 (unauthenticated), 404 (non-member), 400 (invalid dates).
  - GET list: 200 (returns runs), 401, 404.
  - GET detail: 200, 404 (not found), 401.

## Verification

Run these commands and record actual outcomes:

1. `pnpm --filter @userpulse/database build` — Prisma client regeneration.
2. `pnpm --filter api test` — All unit tests pass.
3. `pnpm --filter api test:e2e` — All e2e tests pass (requires PostgreSQL).
4. `pnpm lint` — No new warnings.
5. `pnpm typecheck` — Pass.
6. `pnpm build` — Pass.
7. `pnpm format:check` — Pass.

## Definition of Done

- [ ] An authorized org member can POST to request analysis for a project.
- [ ] The analysis-run record stores correct tenant, project, requester, and period.
- [ ] The background processor picks up QUEUED runs and processes them.
- [ ] All five statuses (QUEUED, RUNNING, COMPLETED, FAILED, INSUFFICIENT_DATA) are reachable and displayed.
- [ ] Insufficient data produces a clear message.
- [ ] Concurrent run requests are rejected (409).
- [ ] Unit tests cover service, processor, and DTO validation.
- [ ] E2E tests cover API endpoints.
- [ ] Lint, typecheck, and build pass.
- [ ] progress.md updated.

## Assumptions / open questions

- **Minimum event threshold (10):** Hardcoded for MVP. Can be made configurable later.
- **Analysis period max (90 days):** Reasonable default. Can be adjusted.
- **Background processor:** Uses `@Interval(10000)` polling. Could be replaced with event-driven trigger when EventBridge is set up (US-046).
- **COMPLETED without recommendations:** For this story, COMPLETED means the run validated data sufficiency. US-042 adds actual AI analysis and recommendation generation.
- **No cancellation:** Users cannot cancel a QUEUED/RUNNING run in this story. Could be added later.
