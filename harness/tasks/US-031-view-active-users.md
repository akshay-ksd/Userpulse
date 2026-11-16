# US-031 — View active users

- **Epic:** EP-07 Product Analytics
- **Priority:** P0 (M4 — Feature Management and Analytics Foundation / M5 — Product Analytics Dashboard)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-16)
- **Created:** 2026-11-16

## Story

> **As a** product manager, **I want** to view active users for a selected period, **so that** I can understand how many users interact with my product.

## Acceptance criteria

- [ ] Distinct active user references are calculated for the selected period.
- [ ] The active-user definition is accessible.
- [ ] Anonymous and identified identity rules are consistent.
- [ ] Results match deterministic test data.

## Story review

**Scope boundary:** This story adds an active-users analytics endpoint and a dashboard section. It builds on the existing `AnalyticsModule` (from US-030) and the `Event` model. It does NOT add feature adoption (US-032), usage trends (US-033), or date-range filtering beyond the existing preset periods (US-035).

**Key decisions:**

- **Active-user identity rule:** An active user is a distinct user reference that generated at least one valid event during the selected period. Identity is resolved as `COALESCE(user_id, anonymous_id)` — if `userId` is present (identified user), use it; otherwise use `anonymousId` (anonymous user). This means:
  - An identified user is counted once regardless of how many anonymousIds they used.
  - An anonymous user (no userId) is counted by their anonymousId.
  - Events with neither userId nor anonymousId are excluded from the count.
- **Query approach:** Use a PostgreSQL `COUNT(DISTINCT ...)` raw query on the `events` table filtered by `projectId`, `validationStatus = 'VALID'`, and the date range. Also provide a daily breakdown for chart display.
- **Response shape:** `{ total: number, daily: Array<{ date: string, count: number }>, startDate: string, endDate: string, definition: string }`. The `definition` field explains the active-user metric to fulfill the "definition is accessible" acceptance criterion.
- **Date reuse:** Reuse the existing `eventActivityQuerySchema` DTO for date range validation.
- **Web component:** Add an `ActiveUsersSection` next to the existing `EventActivitySection` on the project detail page, using the same period presets and bar chart pattern.

**Out of scope:**
- Feature adoption (US-032)
- Feature usage trends (US-033)
- Custom date range picker (US-035)
- ClickHouse migration (production concern)

## Current codebase state (verified 2026-11-16)

- `apps/api/src/analytics/analytics.service.ts` — `getEventActivity()` queries events with membership/project authorization checks and returns daily counts. Pattern to follow.
- `apps/api/src/analytics/analytics.controller.ts` — `GET .../analytics/event-activity` endpoint with Zod validation. Pattern to follow.
- `apps/api/src/analytics/event-activity-query.dto.ts` — Zod schema for `startDate`/`endDate` query params. Reusable.
- `apps/api/src/analytics/analytics.module.ts` — Module with PrismaModule import.
- `packages/database/prisma/schema.prisma` — `Event` model has `userId String?`, `anonymousId String?`, `projectId String`, `validationStatus String`, `eventTimestamp DateTime`.
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — Project detail page with `EventActivitySection` using period presets (7d/30d/90d) and bar chart. Pattern to follow.

## Dependencies

- **Upstream:** US-021 (Done — ingestion), US-022 (Done — validation), US-030 (Done — event activity analytics).
- **Downstream:** US-032 (feature adoption — uses active-user count as denominator), US-033 (usage trends), US-035 (date range filter).

## Implementation subtasks

### 1. API — Add `getActiveUsers` to AnalyticsService

- [ ] In `apps/api/src/analytics/analytics.service.ts`:
  - Add `ActiveUsersResult` interface: `{ total: number, daily: DailyCount[], startDate: string, endDate: string, definition: string }`.
  - Add `getActiveUsers(orgId, projectId, userId, startDate, endDate)` method.
  - Verify org membership and project existence (same pattern as `getEventActivity`).
  - Query total distinct active users: `SELECT COUNT(DISTINCT COALESCE(user_id, anonymous_id)) FROM events WHERE project_id = $1 AND validation_status = 'VALID' AND event_timestamp >= $2 AND event_timestamp <= $3 AND (user_id IS NOT NULL OR anonymous_id IS NOT NULL)`.
  - Query daily distinct active users: `SELECT DATE(event_timestamp) AS day, COUNT(DISTINCT COALESCE(user_id, anonymous_id)) FROM events ... GROUP BY DATE(event_timestamp) ORDER BY day`.
  - Zero-fill missing dates in the range (same pattern as event activity).
  - Return definition: `"An active user is a distinct identified (userId) or anonymous (anonymousId) reference that generated at least one valid event during the selected period."`.

### 2. API — Add `active-users` endpoint to AnalyticsController

- [ ] In `apps/api/src/analytics/analytics.controller.ts`:
  - Add `@Get('active-users')` method `getActiveUsers()`.
  - Reuse `eventActivityQuerySchema` for query validation.
  - Delegate to `analyticsService.getActiveUsers()`.

### 3. Web — Add ActiveUsersSection to project detail page

- [ ] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add `ActiveUsersData` type: `{ total: number, daily: Array<{ date: string, count: number }>, startDate: string, endDate: string, definition: string }`.
  - Add `ActiveUsersSection` component following `EventActivitySection` pattern:
    - Period presets (7d/30d/90d).
    - Fetch from `GET .../analytics/active-users?startDate=...&endDate=...`.
    - Display total count, daily bar chart, and definition tooltip/text.
    - Handle loading, error, and empty states.
  - Add the section between `EventActivitySection` and `FeaturesSection` with a separator.

### 4. Tests — Unit tests

- [ ] In `apps/api/src/analytics/__tests__/analytics.service.spec.ts`:
  - Test `getActiveUsers` — non-member throws NotFoundException.
  - Test `getActiveUsers` — non-existent project throws NotFoundException.
  - Test `getActiveUsers` — returns total and zero-filled daily counts.
  - Test `getActiveUsers` — returns all zeros for empty date range.
  - Test `getActiveUsers` — returns definition string.
- [ ] In `apps/api/src/analytics/__tests__/analytics.controller.spec.ts`:
  - Test `getActiveUsers` — returns active users for valid params.
  - Test `getActiveUsers` — throws BadRequestException for missing dates.

## Verification

1. `pnpm --filter api test` — all unit tests pass.
2. `pnpm lint` — pass.
3. `pnpm typecheck` — pass.
4. `pnpm build` — pass.
5. `pnpm format:check` — pass.

## Definition of Done

- [ ] Distinct active user references are calculated using COALESCE(userId, anonymousId).
- [ ] Active-user definition is returned in the API response and displayed in the UI.
- [ ] Anonymous and identified identity rules are consistent (COALESCE logic).
- [ ] Unit tests verify the calculation with deterministic test data.
- [ ] Authorization checks prevent cross-tenant access.
- [ ] Loading, empty, and error states are handled in the UI.
- [ ] No unrelated changes introduced.

## Assumptions / open questions

- **Identity resolution:** Using `COALESCE(user_id, anonymous_id)` means if a user is identified (`userId` set), their anonymousId is ignored for counting purposes. This is consistent with the SDK behavior where `identify()` sets userId and subsequent events carry both.
- **No ClickHouse:** MVP uses PostgreSQL for analytics queries. Production migration is a separate concern.
- **No custom date range:** Uses the same 7d/30d/90d presets as event activity. Custom date range is US-035.
