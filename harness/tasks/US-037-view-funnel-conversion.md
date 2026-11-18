# US-037 — View funnel conversion and drop-off

- **Epic:** EP-08 Funnels and Behavioral Insights
- **Priority:** P0 (M6 — Funnels and Behavioral Insights)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-17)
- **Created:** 2026-11-17

## Story

> **As a** product analyst, **I want** to view users reaching each funnel step, **so that** I can identify where users leave a flow.

## Acceptance criteria

- [x] User counts for each step are displayed.
- [x] Conversion and drop-off between steps are displayed.
- [x] Identity, ordering, and conversion-window rules are consistent.
- [x] The date range and funnel definition are visible.
- [x] Drop-off is not presented as proof of a specific cause.

## Story review

**Scope boundary:** This story adds funnel analytics — a read-only API endpoint that calculates per-step user counts, conversion rates, and drop-off for an existing funnel definition (from US-036), plus a frontend section to display the results. No changes to funnel CRUD.

**Key decisions:**

- **Identity rule:** A user is identified by `COALESCE(userId, anonymousId)` — the same rule used throughout the analytics module (active users, feature adoption). This ensures consistency (AC 3).
- **Ordering rule:** Events must occur in funnel step order based on `eventTimestamp`. A user reaches step N only if they performed step N's event after performing step N-1's event. This is a strict sequential ordering — same event can't satisfy multiple steps.
- **Conversion window:** Default to the full date range (no separate conversion window). A conversion-window constraint is P1 (JOUR-04) and out of scope. The API response documents the rules used.
- **Drop-off calculation:** `dropOff = previousStepUsers - currentStepUsers`. Drop-off rate = `dropOff / previousStepUsers * 100`. Response includes a disclaimer that drop-off does not imply a specific cause (AC 5, PRD requirement).
- **Query approach:** Use raw SQL against the PostgreSQL `events` table. For each funnel, build a CTE-based query that chains steps sequentially. MVP uses PostgreSQL; production would use ClickHouse.
- **API endpoint:** `GET /organizations/:orgId/projects/:projectId/funnels/:funnelId/analytics` with `startDate` and `endDate` query params. Follows the analytics controller pattern.
- **Frontend:** Add a "View Analytics" button/section to the expanded funnel view on the project page. Shows a step-by-step table with counts, conversion %, and drop-off %.

**Out of scope:**
- Conversion window configuration (JOUR-04, P1)
- Funnel comparison over time
- Per-step time analysis
- Export/download

## Current codebase state (verified 2026-11-17)

- **Funnel CRUD** (`apps/api/src/funnels/`): `FunnelsModule` with `FunnelsService` and `FunnelsController`. CRUD endpoints at `organizations/:orgId/projects/:projectId/funnels`. `FunnelsService` has `verifyProjectAccess()`, `findOne()` returns funnel with steps ordered by `stepOrder`. `FunnelsModule` exports `FunnelsService`.
- **Analytics pattern** (`apps/api/src/analytics/`): `AnalyticsService` uses raw SQL (`$queryRaw`) for aggregations. Query params validated with Zod (`eventActivityQuerySchema`). Controller at `organizations/:orgId/projects/:projectId/analytics`. Access checks: org membership + project existence.
- **Events table** (`packages/database/prisma/schema.prisma`): `Event` model with `eventName`, `userId`, `anonymousId`, `eventTimestamp`, `projectId`, `validationStatus`, `processingStatus`. Indexes on `(projectId, eventTimestamp)`.
- **Web funnel UI** (`apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`): `FunnelsSection` component with list, expand/collapse, create/edit/delete. Expanded view shows steps as an ordered list. No analytics display yet.
- **Date range state**: Project page has `dateRange` state (`startDate`/`endDate`) used by analytics sections. `FunnelsSection` currently doesn't receive it.

## Dependencies

- **Upstream:** US-036 (Done — funnel definition CRUD). US-021 (Done — event ingestion). US-035 (Done — date range filtering).
- **Downstream:** US-039/US-040 (behavioral insights) may reference funnel drop-off data. EP-09 AI recommendations will use funnel analytics as input.

## Implementation subtasks

### 1. API — Add funnel analytics query DTO

- [x] Create `apps/api/src/funnels/funnel-analytics-query.dto.ts`:
  - Reuse the same date validation pattern as `eventActivityQuerySchema`.
  - Zod schema: `startDate` (YYYY-MM-DD), `endDate` (YYYY-MM-DD), endDate >= startDate, range <= 365 days.
  - Export `funnelAnalyticsQuerySchema` and `FunnelAnalyticsQueryDto`.

### 2. API — Add funnel analytics method to FunnelsService

- [x] Add to `apps/api/src/funnels/funnels.service.ts`:
  - New interface `FunnelStepAnalytics`: `{ stepOrder: number, eventName: string, users: number, conversionRate: number, dropOff: number, dropOffRate: number }`.
  - New interface `FunnelAnalyticsResult`: `{ funnelId: string, funnelName: string, steps: FunnelStepAnalytics[], totalEnteredUsers: number, totalConvertedUsers: number, overallConversionRate: number, startDate: string, endDate: string, identityRule: string, orderingRule: string, conversionWindow: string, disclaimer: string }`.
  - New method `async getAnalytics(orgId, projectId, userId, funnelId, startDate, endDate): Promise<FunnelAnalyticsResult>`:
    1. Call `verifyProjectAccess(orgId, projectId, userId)`.
    2. Fetch funnel with steps via `findOne()`.
    3. Build a SQL query using CTEs:
       - Base CTE: select distinct users (`COALESCE(user_id, anonymous_id)`) who performed step 0's event in the date range.
       - For each subsequent step: join to find users from the previous step who also performed the current step's event at a later `eventTimestamp`.
       - Final: count distinct users per step.
    4. Calculate conversion rate (users at step N / users at step 0 * 100) and drop-off (users at step N-1 - users at step N) for each step.
    5. Return result with metadata strings documenting identity rule, ordering rule, conversion window, and disclaimer.
  - Identity rule string: `"A user is identified by userId when available, otherwise anonymousId (COALESCE)."`
  - Ordering rule string: `"Events must occur in step order by timestamp. A user reaches step N only after completing step N-1."`
  - Conversion window string: `"Full date range (no separate conversion window)."`
  - Disclaimer string: `"Drop-off indicates where users did not complete the next step. It does not imply a specific cause."`

### 3. API — Add funnel analytics endpoint to FunnelsController

- [x] Add to `apps/api/src/funnels/funnels.controller.ts`:
  - `@Get(':funnelId/analytics')` endpoint.
  - Parse query params with `funnelAnalyticsQuerySchema`.
  - Call `funnelsService.getAnalytics(orgId, projectId, user.id, funnelId, startDate, endDate)`.
  - Return `FunnelAnalyticsResult`.

### 4. API — Unit tests for funnel analytics

- [x] Add to `apps/api/src/funnels/funnels.service.spec.ts` (or new file `funnel-analytics.service.spec.ts`):
  - Test `getAnalytics()`:
    - Happy path: mock funnel with 3 steps, mock `$queryRaw` returning step counts, verify conversion and drop-off calculations.
    - Non-member: throws NotFoundException.
    - Funnel not found: throws NotFoundException.
    - Empty data: all steps have 0 users, conversion 0%.
    - Single step funnel edge case (should still work — funnel has minimum 2 steps from US-036).
  - Test calculation logic: given known step counts, verify conversionRate, dropOff, dropOffRate, overallConversionRate.

### 5. Web — Add funnel analytics display

- [x] Update `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Pass `startDate` and `endDate` from the page's `dateRange` state to `FunnelsSection`.
  - In `FunnelsSection`, add a "View Analytics" button for each funnel (next to View/Edit/Delete).
  - When clicked, fetch `GET /organizations/:orgId/projects/:projectId/funnels/:funnelId/analytics?startDate=...&endDate=...`.
  - Display results in an expandable section below the funnel:
    - **Funnel name and date range** at the top.
    - **Step table**: columns — Step #, Event Name, Users, Conversion %, Drop-off, Drop-off %.
      - Step 0 (entry): users count, 100% conversion, no drop-off.
      - Subsequent steps: users, conversion from entry, drop-off from previous, drop-off %.
    - **Summary row**: total entered, total converted (last step), overall conversion rate.
    - **Rules section**: small text showing identity rule, ordering rule, conversion window.
    - **Disclaimer**: italic text at the bottom.
  - Handle loading, error, and empty states (no events in range).

### 6. API — E2E tests (if PostgreSQL available)

- [ ] Add e2e tests in `apps/api/test/funnels-analytics.e2e-spec.ts`:
  - Create a user, org, project, funnel, and ingest events matching funnel steps.
  - `GET .../funnels/:funnelId/analytics?startDate=...&endDate=...` returns correct step counts.
  - Non-member gets 404.
  - Invalid date range gets 400.
  - Funnel with no matching events returns all 0 counts.

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

- [ ] User counts for each funnel step are displayed.
- [ ] Conversion rate and drop-off between steps are calculated and displayed.
- [ ] Identity rule (COALESCE userId/anonymousId) is consistent with other analytics.
- [ ] Ordering rule (sequential by timestamp) is documented in response.
- [ ] Date range and funnel definition are visible in the UI.
- [ ] Drop-off disclaimer is shown — not presented as proof of a specific cause.
- [ ] Unit tests cover analytics calculation logic.
- [ ] Lint, typecheck, and build pass.
- [ ] Progress.md and task file updated.

## Assumptions / open questions

- **No conversion window constraint** — the full date range is the window. JOUR-04 (P1) will add configurable windows later.
- **PostgreSQL-only** — funnel analytics query runs against the `events` table in PostgreSQL. Production migration to ClickHouse is a separate concern.
- **No caching** — funnel analytics are computed on each request. For MVP with PostgreSQL event volumes this is acceptable.
- **Step 0 is entry** — the first step in the funnel definition (stepOrder 0) is the entry point. Users who performed this event enter the funnel.
