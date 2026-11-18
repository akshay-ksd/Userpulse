# US-038 — View common user journeys

- **Epic:** EP-08 Funnels and Behavioral Insights
- **Priority:** P1 (M6 — Funnels and Behavioral Insights)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-17)
- **Created:** 2026-11-17

## Story

> **As a** product manager, **I want** to view common event sequences, **so that** I can understand how users navigate my product.

## Acceptance criteria

- [x] Common event sequences are displayed for a project and period.
- [x] Relevant counts are shown.
- [x] Low-volume sequences are filtered or labeled.
- [x] Identity and session rules are documented.
- [x] Data is restricted to the selected project.

## Story review

**Scope boundary:** This story adds a read-only "User Journeys" analytics endpoint and frontend section. It identifies the most common N-length event sequences performed by users within the selected date range and project. No configuration, no saved journeys — just a query-time view.

**Key decisions:**

- **Sequence definition:** A "user journey" is an ordered sequence of event names performed by the same user identity (COALESCE(userId, anonymousId)). We analyze sequences of length 2–5 (configurable via query param `maxSteps`, default 3). This avoids unbounded sequence mining.
- **Grouping by user identity:** Same identity rule as funnels and active users — `COALESCE(user_id, anonymous_id)`. Each user's events are ordered by `event_timestamp`.
- **Sequence extraction:** Use a SQL window function approach: for each user, number their events chronologically, then extract subsequences of consecutive events. Group by the sequence tuple and count distinct users.
- **Low-volume filtering:** Sequences with fewer than `minUsers` (default 2) users are excluded from results. Remaining low-volume sequences (< 5% of total entered users) are labeled with `lowVolume: true`.
- **Result limit:** Return top N sequences by user count (default 20, max 50).
- **No session concept:** MVP does not define sessions (no session timeout or session ID). Events are ordered by timestamp within the full date range per user. This is documented in the response.
- **API pattern:** Add `GET .../analytics/user-journeys` endpoint on `AnalyticsController`, matching existing analytics endpoint patterns.
- **Web pattern:** Add a `UserJourneysSection` to the project detail page, matching the pattern of other analytics sections.

**Out of scope:**
- Session definition or session-based grouping (future enhancement)
- Saved/named journeys
- Journey visualization (Sankey/flow diagrams)
- Journey filtering by specific events
- Real-time journey tracking

## Current codebase state (verified 2026-11-17)

- **AnalyticsModule** (`apps/api/src/analytics/`): `AnalyticsController` at `organizations/:orgId/projects/:projectId/analytics` with endpoints for event-activity, active-users, feature-adoption, feature-usage-comparison, feature-usage-trends. `AnalyticsService` uses `PrismaService` with raw SQL queries for aggregations. Each method verifies org membership and project access.
- **Query DTO** (`apps/api/src/analytics/event-activity-query.dto.ts`): Zod schemas for `startDate`/`endDate` (YYYY-MM-DD, max 365 days). Reusable for this story.
- **FunnelsService** (`apps/api/src/funnels/funnels.service.ts`): Uses CTE-based SQL with `COALESCE(user_id, anonymous_id)` for user identity — same pattern needed here.
- **Event model**: Has `projectId`, `eventName`, `userId`, `anonymousId`, `eventTimestamp`, `validationStatus`, `processingStatus`.
- **Web project page** (`apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`): Large single-file component with inline section components for features, analytics, funnels, etc.

## Dependencies

- **Upstream:** US-021 (Done — event ingestion), US-030 (Done — event activity analytics), US-035 (Done — date range filtering). All satisfied.
- **Downstream:** US-039 and US-040 are independent behavioral insight stories. AI recommendations (EP-09) may reference journey data.

## Implementation subtasks

### 1. API — Add user-journeys query DTO

- [x] In `apps/api/src/analytics/event-activity-query.dto.ts`:
  - Add `userJourneysQuerySchema` — extends date range validation with optional `maxSteps` (integer, 2–5, default 3), optional `minUsers` (integer, 1–100, default 2), optional `limit` (integer, 1–50, default 20).
  - Export `UserJourneysQueryDto` type.

### 2. API — Add getUserJourneys to AnalyticsService

- [x] In `apps/api/src/analytics/analytics.service.ts`:
  - Add `UserJourneySequence` interface: `{ sequence: string[]; userCount: number; lowVolume: boolean }`.
  - Add `UserJourneysResult` interface: `{ sequences: UserJourneySequence[]; totalUsers: number; startDate: string; endDate: string; maxSteps: number; minUsers: number; identityRule: string; sessionRule: string }`.
  - Add `getUserJourneys(orgId, projectId, userId, startDate, endDate, maxSteps, minUsers, limit)` method:
    1. Verify org membership and project access (same pattern as other methods).
    2. Query total distinct users in the period (for low-volume labeling).
    3. Run a CTE-based query:
       - CTE `user_events`: Select distinct user identity (`COALESCE(user_id, anonymous_id) AS uid`), `event_name`, `event_timestamp`, with `ROW_NUMBER() OVER (PARTITION BY uid ORDER BY event_timestamp)` as `rn`. Filter by projectId, validationStatus='VALID', date range.
       - CTE `sequences`: For each user, generate all consecutive subsequences of length `maxSteps` by self-joining `user_events` on `uid` where `rn` values are consecutive (rn, rn+1, ..., rn+maxSteps-1). Concatenate event names into an array.
       - Outer query: GROUP BY the sequence array, COUNT DISTINCT uid, filter by `minUsers`, ORDER BY count DESC, LIMIT.
    4. Label sequences where `userCount < 0.05 * totalUsers` as `lowVolume: true`.
    5. Return result with identity and session rule documentation strings.

### 3. API — Add controller endpoint

- [x] In `apps/api/src/analytics/analytics.controller.ts`:
  - Add `@Get('user-journeys')` endpoint: parse query with `userJourneysQuerySchema`, call `analyticsService.getUserJourneys()`, return `UserJourneysResult`.
  - Import the new query schema and result type.

### 4. API — Unit tests

- [x] Create `apps/api/src/analytics/__tests__/user-journeys.spec.ts` (or add to existing spec):
  - Test `getUserJourneys` service method with mocked Prisma:
    - Happy path: returns sequences sorted by user count.
    - Low-volume labeling: sequences below 5% threshold labeled correctly.
    - Empty result: no events in range returns empty sequences.
    - Non-member access: throws NotFoundException.
    - Missing project: throws NotFoundException.

### 5. Web — Add UserJourneysSection component

- [x] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add `UserJourneysSection` inline component (matching existing section patterns).
  - Props: `orgId`, `projectId`, date range from parent state.
  - On mount/date change: `GET /organizations/:orgId/projects/:projectId/analytics/user-journeys?startDate=...&endDate=...`.
  - Display:
    - Table/list of sequences with rank, sequence steps (as breadcrumb-style display: "Event A → Event B → Event C"), user count, and low-volume badge.
    - Total users context.
    - Identity and session rule documentation below the table.
    - Loading, empty, and error states.
  - Controls: Optional `maxSteps` selector (2–5, default 3).

### 6. E2E tests (if PostgreSQL available)

- [ ] Add e2e test for `GET /organizations/:orgId/projects/:projectId/analytics/user-journeys` (deferred — no PostgreSQL):
  - 200 with valid data and sequences returned.
  - 200 empty when no events in range.
  - 400 for invalid query params.
  - 401 for unauthenticated.
  - 404 for non-member.

## Verification

```bash
# Unit tests
pnpm --filter api test

# E2E tests (requires PostgreSQL)
pnpm --filter api test:e2e

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Build
pnpm build

# Format
pnpm format:check
```

## Definition of Done

- [x] Common event sequences are displayed for a project and period.
- [x] Relevant counts (user count per sequence, total users) are shown.
- [x] Low-volume sequences are labeled with a badge.
- [x] Identity rule (COALESCE userId/anonymousId) and session rule (no session, full date range) are documented in the API response and shown in the UI.
- [x] Data is restricted to the selected project (org membership + project access verified).
- [x] Unit tests added and passing.
- [x] Lint, typecheck, build, format all pass.
- [ ] Task file and progress.md updated.

## Assumptions / open questions

- **No session timeout:** MVP uses full date range per user, not session-based windowing. This is a simplification — documented in the response.
- **Sequence length:** Fixed-length sequences (all exactly `maxSteps` long). Users with fewer events than `maxSteps` contribute no sequences. This is intentional — partial sequences would add noise.
- **$page events included:** System events like `$page` are included in sequences by default. No event type filtering in MVP.
- **Performance:** Raw SQL with window functions on the events table. For large event volumes, this query may be slow — acceptable for MVP with PostgreSQL. ClickHouse migration (architecture) would address performance at scale.
