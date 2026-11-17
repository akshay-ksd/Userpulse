# US-046 — Schedule recurring analysis

- **Epic:** EP-09 AI Recommendations
- **Priority:** P1
- **Source:** `harness/user-stories.md`
- **Status:** Done
- **Created:** 2026-11-17

## Story

> **As a** project administrator, **I want** analysis to run on a schedule, **so that** I receive updated insights without manual requests.

## Acceptance criteria

- [x] A supported schedule can be enabled for a project.
- [x] Scheduled runs record execution status.
- [x] Failed runs follow a retry policy.
- [x] Prohibited overlapping runs are prevented.
- [x] The schedule can be disabled.

## Story review

**Scope boundary:** This story adds a schedule configuration model per project, a scheduler service that queues analysis runs on schedule, and API endpoints to manage the schedule. It does not change evidence gathering, scoring, the recommendation pipeline, or the UI beyond the API.

**Key decisions:**

- **Schedule model.** Add `AnalysisSchedule` model to PostgreSQL with `projectId` (unique), `organizationId`, `intervalHours` (supported: 24, 168 for daily/weekly), `enabled`, `lastRunAt`, `nextRunAt`, `createdBy`, `updatedBy`.
- **Scheduler service.** A `ScheduledAnalysisRunnerService` using `@Interval` checks for due schedules every 60 seconds. When `nextRunAt <= now` and `enabled = true`, it queues an analysis run for the last `intervalHours` period.
- **Overlap prevention.** Before queueing, the scheduler checks for existing QUEUED/RUNNING runs (same logic as `requestAnalysis`). If one exists, it skips and schedules `nextRunAt` for the next interval — no duplicate runs.
- **Retry policy.** If a scheduled run fails, it does NOT block future scheduled runs. The next run still fires on schedule. The failed run is recorded normally via the existing `AnalysisRunProcessorService`.
- **requestedById.** Scheduled runs use the `createdBy` user from the schedule as the `requestedById`.
- **Disable.** Setting `enabled: false` stops future scheduled runs. The schedule record is preserved.

## Dependencies

- Upstream: US-041 (done), US-042 (done).
- Downstream: None direct.

## Implementation subtasks

### 1. Database — Add AnalysisSchedule model

- [x] Add `AnalysisSchedule` model with fields: `id`, `projectId` (unique), `organizationId`, `intervalHours`, `enabled`, `lastRunAt`, `nextRunAt`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`.
- [x] Add relation to `Project`.
- [x] Create migration.

### 2. API — Add schedule management endpoints

- [x] DTO for create/update schedule with Zod validation.
- [x] `AnalysisScheduleService` with `upsert`, `findByProject`, `disable` methods.
- [x] Controller endpoints: `PUT` to create/update schedule, `GET` to retrieve, `DELETE` to disable.
- [x] Authorization: verify project membership.

### 3. API — Add ScheduledAnalysisRunnerService

- [x] Interval-based service (60s) that queries due schedules.
- [x] For each due schedule: check no overlap, create analysis run, update `lastRunAt` and `nextRunAt`.
- [x] Skip gracefully if overlap exists.
- [x] Log scheduled runs for observability.

### 4. Tests

- [x] Unit tests for schedule service (upsert, find, disable).
- [x] Unit tests for scheduler runner (fires on schedule, skips overlap, updates nextRunAt).
- [x] Build/lint/typecheck pass.

## Verification

```
pnpm --filter api test          # Unit tests
pnpm lint                       # Lint check
pnpm typecheck                  # Type check
pnpm build                      # Build check
pnpm format:check               # Format check
```

## Definition of Done

- [x] The implementation meets the requested behavior and acceptance criteria.
- [x] The solution follows the approved architecture and existing project conventions.
- [x] Changes are limited to the task and necessary related updates.
- [x] Relevant tests have been added or updated.
- [x] Relevant tests and checks have been executed, or unrun checks are explicitly disclosed.
- [x] Authorization, tenant isolation, privacy, and security implications have been considered.
- [x] API, event, database, and documentation contracts are updated when required.
- [x] No unrelated changes or destructive operations have been introduced.
- [x] The final report accurately describes changes, verification, and remaining limitations.
