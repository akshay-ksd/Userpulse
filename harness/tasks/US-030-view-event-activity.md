# US-030 — View event activity

| Field | Value |
|---|---|
| **Epic** | EP-07 Product Analytics |
| **Priority** | P0 |
| **Milestone** | M5 — Product Analytics Dashboard |
| **Source** | `harness/user-stories.md` § US-030 |
| **Status** | Not Started |
| **Created** | 2026-11-16 |

## Story

**As a** product manager, **I want** to view total event activity for a selected period, **so that** I can understand overall product usage.

## Acceptance criteria

- [ ] Total qualifying events are displayed for the selected period.
- [ ] The selected period is visible.
- [ ] Empty periods are represented clearly.
- [ ] Only authorized project data is included.

## Story review

### Scope

This is the first analytics story. It establishes:
1. A new `AnalyticsModule` in the API with a service and controller.
2. An analytics API endpoint that queries the PostgreSQL `events` table (MVP — ClickHouse deferred).
3. A project analytics page in the web app showing total event count for a date range.

### Key decisions

- **Query source:** PostgreSQL `events` table, filtering `validationStatus = 'VALID'` and `processingStatus IN ('PENDING', 'PROCESSED')` (include pending — they are accepted events). Rejected and DLQ events are excluded.
- **Date range:** Filter on `eventTimestamp` (client-reported time, not `ingestedAt`). Default to last 7 days.
- **Endpoint pattern:** `GET /organizations/:orgId/projects/:projectId/analytics/event-activity` with `startDate` and `endDate` query params (ISO 8601 date strings).
- **Authorization:** Reuse existing org membership check pattern from projects/features modules.
- **Empty state:** Show "0 events" with a message guiding the user to set up tracking if no events exist.
- **Daily breakdown:** Return daily counts alongside the total, so the UI can show a simple bar/line chart later (US-033 builds on this).

### Out of scope

- ClickHouse integration (infrastructure dependency).
- Active users (US-031), feature adoption (US-032), trends chart (US-033).
- Date range picker component (use simple preset buttons: 7d, 30d, 90d for MVP).
- Real-time updates / WebSocket.

## Current codebase state

- **Events table:** `packages/database/prisma/schema.prisma` — `Event` model with `projectId`, `eventTimestamp`, `validationStatus`, `processingStatus`. Indexes on `(projectId, ingestedAt)` and `(projectId, validationStatus)`.
- **No analytics module exists** — this is the first analytics endpoint.
- **Existing patterns:** `FeaturesModule` (`apps/api/src/features/`) is a good reference for org-membership-gated endpoints within a project context.
- **Web app:** Project detail page at `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` shows tracking credentials. Analytics would be a new section or tab.
- **Ingestion:** `IngestionModule` stores events via `POST /v1/events` (US-021). Events have `validationStatus` and `processingStatus`.

## Dependencies

### Upstream (must be Done)

- US-021 Submit an event batch — **Done** ✓
- US-022 Validate and normalize events — **Done** ✓
- US-023 Process queued events — **Done** ✓
- US-009 Create a project — **Done** ✓

### Downstream (depends on this)

- US-031 View active users — will extend the analytics module.
- US-033 View feature usage trends — will use the daily breakdown pattern.

## Implementation subtasks

### 1. Database

No schema changes needed. The existing `events` table has all required fields. However, we need an index for the analytics query pattern.

- [ ] Add index `@@index([projectId, eventTimestamp])` to the `Event` model for efficient date-range queries.
- [ ] Run `npx prisma migrate dev --name add_event_timestamp_index`.

### 2. API — AnalyticsModule

- [ ] Create `apps/api/src/analytics/analytics.module.ts` — imports `PrismaModule`.
- [ ] Create `apps/api/src/analytics/analytics.service.ts` — `AnalyticsService` with:
  - `getEventActivity(projectId: string, startDate: Date, endDate: Date)` — returns `{ total: number, daily: Array<{ date: string, count: number }>, startDate: string, endDate: string }`.
  - Query: `prisma.event.count()` with `WHERE projectId = ? AND eventTimestamp >= ? AND eventTimestamp < ? AND validationStatus = 'VALID'`.
  - Daily breakdown: `prisma.$queryRaw` with `DATE(event_timestamp)` grouping, ordered by date.
  - Fill missing dates with `count: 0` for days in the range with no events.
- [ ] Create `apps/api/src/analytics/analytics.controller.ts` — `AnalyticsController`:
  - `GET /organizations/:orgId/projects/:projectId/analytics/event-activity`
  - Query params: `startDate` (ISO date, required), `endDate` (ISO date, required).
  - Verify org membership (same pattern as `FeaturesController`).
  - Verify project belongs to org.
  - Return 200 with `{ total, daily, startDate, endDate }`.
  - Return 400 for invalid/missing dates, 404 for non-member/missing project, 401 for unauthenticated.
- [ ] Create `apps/api/src/analytics/dto/event-activity-query.dto.ts` — Zod schema for query params: `startDate` (ISO date string), `endDate` (ISO date string), validate endDate >= startDate, max range 365 days.
- [ ] Register `AnalyticsModule` in `apps/api/src/app.module.ts`.

### 3. API — Unit tests

- [ ] Create `apps/api/src/analytics/__tests__/analytics.service.spec.ts`:
  - Test `getEventActivity` returns correct total and daily counts.
  - Test empty result returns `{ total: 0, daily: [...zero-filled...] }`.
  - Test date filling for gaps in data.
- [ ] Create `apps/api/src/analytics/__tests__/analytics.controller.spec.ts`:
  - Test valid request returns 200 with expected shape.
  - Test missing dates returns 400.
  - Test invalid date format returns 400.
  - Test endDate < startDate returns 400.

### 4. API — E2E tests

- [ ] Create `apps/api/test/analytics.e2e-spec.ts`:
  - Setup: register user, create org, create project, generate API key, submit events via ingestion endpoint.
  - Test 200 with correct total for date range containing events.
  - Test 200 with zero total for date range with no events.
  - Test 401 for unauthenticated request.
  - Test 404 for non-member accessing another org's project.
  - Test 400 for missing/invalid query params.

### 5. Web — Analytics section on project page

- [ ] Create `apps/web/src/app/organizations/[id]/projects/[projectId]/analytics/page.tsx` — dedicated analytics page (or add analytics section to existing project page).
  - Fetch `GET /organizations/:orgId/projects/:projectId/analytics/event-activity?startDate=...&endDate=...`.
  - Display total event count prominently.
  - Display the selected period (e.g., "Nov 9 – Nov 16, 2026").
  - Period selector: preset buttons (Last 7 days, Last 30 days, Last 90 days).
  - Empty state: "No events recorded in this period" with guidance to set up tracking.
  - Loading state with skeleton/spinner.
  - Error state.
  - Daily breakdown as a simple list or table (chart deferred to US-033 or added if simple).
- [ ] Add navigation link from project detail page to analytics page (or integrate as a tab/section).

### 6. Verification

- [ ] `pnpm --filter api test` — unit tests pass.
- [ ] `pnpm --filter api test:e2e` — e2e tests pass (if PostgreSQL available).
- [ ] `pnpm lint` — pass.
- [ ] `pnpm typecheck` — pass.
- [ ] `pnpm build` — pass.
- [ ] `pnpm format:check` — pass.

## Definition of Done

- [ ] Total qualifying events displayed for a selected period.
- [ ] Selected period is visible in the UI.
- [ ] Empty periods show clear empty state.
- [ ] Only authorized project data is included (org membership enforced).
- [ ] Unit tests added and passing.
- [ ] E2E tests written (run if PostgreSQL available).
- [ ] Lint, typecheck, build, format pass.
- [ ] Progress.md and task file updated.

## Assumptions / open questions

- **PostgreSQL for MVP:** Analytics queries run against the PostgreSQL `events` table. ClickHouse migration is an infrastructure concern for production scale.
- **Date range defaults:** Last 7 days by default. Presets for 7d/30d/90d. No custom date picker for this story.
- **Event qualification:** Only `validationStatus = 'VALID'` events are counted. All processing statuses except REJECTED and DLQ are included.
- **Daily granularity:** Daily breakdown included to support future trend visualization (US-033).
- **Timezone:** Dates are in UTC. Client-side timezone handling deferred.
