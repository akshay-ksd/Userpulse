# US-053 — Understand data retention

| Field | Value |
|---|---|
| **Story ID** | US-053 |
| **Epic** | EP-11 Privacy, Security, Operations |
| **Priority** | P0 |
| **Milestone** | M9 — Security and Pilot Readiness |
| **Source** | `harness/user-stories.md` §US-053 |
| **Status** | Not Started |
| **Created** | 2026-11-18 |

## Story

**As an** organization owner, **I want** to understand the platform's data retention policy, **so that** I know how long event data is kept.

## Acceptance criteria

- [ ] The default retention policy is documented.
- [ ] The applicable policy is visible to the customer.
- [ ] Configurable options, if offered, are clearly described.
- [ ] Retention applies consistently to relevant event data and artifacts.
- [ ] Expiration failures are observable.

## Story review

**Scope:** This story requires:
1. A `DataRetentionSetting` model in the database to store per-organization retention config.
2. A default retention policy (90 days for event data).
3. API endpoints for owners to view and update their org's retention settings.
4. A scheduled cleanup job that deletes expired events based on retention settings.
5. An internal metrics endpoint for observability of retention/cleanup operations.
6. Documentation of the retention policy (in API responses, not a separate doc site).

**What's in scope:**
- Database model for retention settings
- API to view/update retention settings (org owner only)
- Background job to enforce retention (delete expired events)
- Metrics/observability for cleanup failures
- Default 90-day retention for events

**What's out of scope:**
- ClickHouse cleanup (MVP uses PostgreSQL only)
- S3 artifact cleanup (no S3 artifacts exist yet)
- SQS message cleanup (MVP uses PostgreSQL staging)
- Per-project retention overrides (org-level only for MVP)
- UI page for retention settings (API only; web can be added later)

**Decisions:**
- Default retention: 90 days for event data. This is a sensible default for a product analytics platform.
- Retention is per-organization, not per-project (simpler for MVP).
- Cleanup runs as a scheduled background job (every hour) using `@nestjs/schedule`.
- Only PROCESSED, FAILED, DLQ, and REJECTED events older than the retention period are deleted. PENDING events are not deleted.

## Current codebase state

- `Event` model in Prisma with `processingStatus`, `ingestedAt`, `eventTimestamp`, `projectId`, `organizationId`.
- `EventProcessorService` uses `@Interval(5000)` for background processing.
- `ScheduleModule.forRoot()` already registered in `AppModule`.
- `GET /internal/metrics/processing` pattern exists for operational endpoints.
- No `DataRetentionSetting` model, no retention-related code.
- Organization model has `id`, members, projects. Owner role enforced via membership check.

## Dependencies

**Upstream (must be Done):**
- US-021 (Submit an event batch) — Done. Events exist in the database.
- US-023 (Process queued events) — Done. Event processing status model exists.
- US-005 (Create an organization) — Done. Organization model exists.

**Downstream (depends on this):**
- US-054 (Request project data deletion) — will use the retention infrastructure.

## Implementation subtasks

### 1. Database — DataRetentionSetting model

- [ ] Add `DataRetentionSetting` model to `packages/database/prisma/schema.prisma`:
  ```
  model DataRetentionSetting {
    id               String   @id @default(uuid())
    organizationId   String   @unique
    eventRetentionDays Int    @default(90)
    createdAt        DateTime @default(now()) @db.Timestamptz(6)
    updatedAt        DateTime @updatedAt @db.Timestamptz(6)
    organization     Organization @relation(fields: [organizationId], references: [id])
    @@map("data_retention_settings")
  }
  ```
- [ ] Add `retentionSetting DataRetentionSetting?` relation to `Organization` model.
- [ ] Run `npx prisma migrate dev --name add_data_retention_settings`.

### 2. API — RetentionModule

- [ ] Create `apps/api/src/retention/retention.module.ts` — NestJS module registering service and controller.
- [ ] Create `apps/api/src/retention/retention.service.ts`:
  - `getRetentionSettings(organizationId: string)` — returns settings or creates default (90 days).
  - `updateRetentionSettings(organizationId: string, eventRetentionDays: number)` — updates settings (owner only, enforced at controller).
  - `getDefaultRetentionDays()` — returns `90`.
- [ ] Create `apps/api/src/retention/retention.controller.ts`:
  - `GET /organizations/:orgId/retention` — returns current retention settings. Requires membership.
  - `PATCH /organizations/:orgId/retention` — updates retention settings. Requires OWNER role.
  - Both verify org membership using existing pattern from `OrganizationsController`.
- [ ] Create `apps/api/src/retention/dto/update-retention.dto.ts`:
  - Zod schema: `eventRetentionDays` integer, min 30, max 3650.
- [ ] Register `RetentionModule` in `AppModule`.

### 3. API — RetentionCleanupService (background job)

- [ ] Create `apps/api/src/retention/retention-cleanup.service.ts`:
  - `@Cron('0 * * * *')` (every hour) — runs cleanup.
  - For each organization with a retention setting, delete events where `ingestedAt < now() - retentionDays` AND `processingStatus NOT IN ('PENDING')`.
  - Use `prisma.event.deleteMany()` with batching (1000 at a time) to avoid long transactions.
  - Log cleanup results: org count processed, events deleted, errors.
  - Track metrics: last run time, events deleted, errors.
- [ ] Create `GET /internal/metrics/retention` endpoint:
  - Returns: last cleanup run time, events deleted in last run, errors in last run, next scheduled run.

### 4. Tests

- [ ] Unit tests for `RetentionService`:
  - `getRetentionSettings` — returns existing settings.
  - `getRetentionSettings` — creates default when none exist.
  - `updateRetentionSettings` — updates days.
  - `updateRetentionSettings` — rejects out-of-range values (validation).
- [ ] Unit tests for `RetentionCleanupService`:
  - `runCleanup` — deletes expired events.
  - `runCleanup` — skips PENDING events.
  - `runCleanup` — handles empty result.
  - `runCleanup` — handles errors gracefully.
  - `getMetrics` — returns cleanup metrics.
- [ ] E2E tests for retention endpoints:
  - `GET /organizations/:orgId/retention` — 200 with defaults, 401 unauthenticated, 404 non-member.
  - `PATCH /organizations/:orgId/retention` — 200 updated, 403 non-owner, 400 invalid days.

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

- [ ] Default retention policy (90 days) is implemented and documented in API responses.
- [ ] Retention settings are visible to org members via `GET /organizations/:orgId/retention`.
- [ ] Owners can configure retention via `PATCH /organizations/:orgId/retention` (30–3650 days).
- [ ] Background cleanup job enforces retention consistently.
- [ ] Cleanup failures are observable via `GET /internal/metrics/retention`.
- [ ] Tests are written and passing.
- [ ] Lint, typecheck, build pass.
- [ ] No unrelated changes.

## Assumptions

- 90-day default retention is appropriate for MVP pilot.
- Per-organization retention (not per-project) is sufficient for MVP.
- Only event data has retention enforcement; other data (users, orgs, recommendations) is not subject to automatic deletion.
- PENDING events are excluded from cleanup to avoid data loss during processing.
- Minimum 30 days prevents accidental short retention; maximum 3650 days (10 years) is a practical upper bound.
