# US-032 — View feature adoption

- **Epic:** EP-07 Product Analytics
- **Priority:** P0 (M4 — Feature Management and Analytics Foundation / M5 — Product Analytics Dashboard)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-16)
- **Created:** 2026-11-16

## Story

> **As a** product manager, **I want** to view feature adoption rates, **so that** I can understand which features are used by active users.

## Acceptance criteria

- [x] Adoption is unique active users who used the feature divided by total active users for the same project and period.
- [x] The result is displayed as a percentage.
- [x] Numerator, denominator, and period can be inspected.
- [x] Results match deterministic test data.

## Story review

**Scope boundary:** This story adds a feature adoption analytics endpoint and a dashboard section. It builds on `AnalyticsService.getActiveUsers()` (US-031) for the denominator and `FeatureEventMapping` (US-028) for mapping features to event names. It does NOT add usage trends over time (US-033), feature comparison ranking (US-034), or custom date range selection (US-035).

**Key decisions:**

- **Adoption rate formula:** `adoptionRate = (featureActiveUsers / totalActiveUsers) * 100`, rounded to one decimal place. If `totalActiveUsers` is 0, adoption rate is 0% (avoid division by zero).
- **Feature active users (numerator):** Count of distinct user references (`COALESCE(user_id, anonymous_id)`) that generated at least one valid event whose `event_name` is mapped to the feature, during the selected period.
- **Total active users (denominator):** Count of distinct user references across all valid events for the project during the same period. Same identity rule as `getActiveUsers()` (US-031).
- **Query approach:** A single raw SQL query joins `events` with `feature_event_mappings` to get per-feature user counts in one pass. A separate query (or reuse of `getActiveUsers` logic) gets the denominator. This avoids N+1 queries for N features.
- **Response shape:** `{ features: Array<{ featureId, featureName, adoptionRate, featureUsers, totalUsers }>, totalActiveUsers, startDate, endDate, definition }`. The `definition` field explains the metric. Each feature entry includes numerator (`featureUsers`) and denominator (`totalUsers`) for transparency.
- **Endpoint:** `GET /organizations/:orgId/projects/:projectId/analytics/feature-adoption?startDate=...&endDate=...`. Reuse `eventActivityQuerySchema` for date validation.
- **Web component:** Add a `FeatureAdoptionSection` to the project detail page, between `ActiveUsersSection` and `FeaturesSection`. Shows a table/list of features with adoption percentages, numerator, denominator, and period. Uses existing period presets (7d/30d/90d).
- **Only ACTIVE features:** Archived features are excluded from adoption display.

**Out of scope:**
- Feature usage trends over time (US-033)
- Feature comparison/ranking (US-034)
- Custom date range picker (US-035)
- ClickHouse migration (production concern)

## Current codebase state (verified 2026-11-16)

- `apps/api/src/analytics/analytics.service.ts` — Has `getEventActivity()` and `getActiveUsers()` methods. `getActiveUsers` uses `COUNT(DISTINCT COALESCE("user_id", "anonymous_id"))` — the same identity rule needed for adoption. Pattern to follow for the new method.
- `apps/api/src/analytics/analytics.controller.ts` — Controller at `organizations/:orgId/projects/:projectId/analytics/` with `GET event-activity` and `GET active-users` endpoints. Uses `eventActivityQuerySchema` for query validation.
- `apps/api/src/analytics/event-activity-query.dto.ts` — Zod schema for `startDate`/`endDate`. Reusable.
- `apps/api/src/analytics/analytics.module.ts` — Module imports `PrismaModule`, exports `AnalyticsService`.
- `apps/api/src/features/features.service.ts` — `FeaturesService` with `verifyProjectAccess()`, `findByProject()`, `getMappings()`, etc. `FeatureEventMapping` links features to event names.
- `packages/database/prisma/schema.prisma` — `Feature` (id, projectId, name, status), `FeatureEventMapping` (featureId, projectId, eventName, `@@unique([projectId, eventName])`), `Event` (projectId, eventName, userId, anonymousId, validationStatus, eventTimestamp).
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — Project detail page with `EventActivitySection`, `ActiveUsersSection`, `FeaturesSection`, etc. Uses `PeriodPreset` type (7d/30d/90d), `getDateRange()`, `formatDateRange()` helpers.

## Dependencies

- **Upstream:** US-028 (Done — event-to-feature mapping), US-031 (Done — active users metric), US-030 (Done — event activity analytics).
- **Downstream:** US-033 (usage trends), US-034 (feature comparison — will use similar per-feature queries).

## Implementation subtasks

### 1. API — Add `getFeatureAdoption` to AnalyticsService

- [ ] In `apps/api/src/analytics/analytics.service.ts`:
  - Add `FeatureAdoptionEntry` interface: `{ featureId: string, featureName: string, adoptionRate: number, featureUsers: number, totalUsers: number }`.
  - Add `FeatureAdoptionResult` interface: `{ features: FeatureAdoptionEntry[], totalActiveUsers: number, startDate: string, endDate: string, definition: string }`.
  - Add `getFeatureAdoption(orgId, projectId, userId, startDate, endDate)` method:
    1. Verify org membership and project access (same pattern as `getActiveUsers`).
    2. Compute date range boundaries (`startDateTime`, `endDateTime`).
    3. Query total active users (denominator) — reuse the same `COUNT(DISTINCT COALESCE(...))` query from `getActiveUsers`.
    4. Query per-feature active users (numerator) via raw SQL:
       ```sql
       SELECT fem."feature_id" AS feature_id,
              COUNT(DISTINCT COALESCE(e."user_id", e."anonymous_id"))::bigint AS count
       FROM events e
       INNER JOIN feature_event_mappings fem
         ON e."project_id" = fem."project_id" AND e."event_name" = fem."event_name"
       WHERE e."project_id" = $1
         AND e."validation_status" = 'VALID'
         AND e."event_timestamp" >= $2
         AND e."event_timestamp" <= $3
         AND (e."user_id" IS NOT NULL OR e."anonymous_id" IS NOT NULL)
       GROUP BY fem."feature_id"
       ```
    5. Fetch active features for the project: `prisma.feature.findMany({ where: { projectId, status: 'ACTIVE' } })`.
    6. Build `features` array: for each active feature, look up its user count from the query result, compute `adoptionRate = totalActiveUsers > 0 ? Math.round((featureUsers / totalActiveUsers) * 1000) / 10 : 0`.
    7. Sort features by adoption rate descending.
    8. Return `{ features, totalActiveUsers, startDate, endDate, definition }`.
  - Add adoption definition constant: `'Feature adoption rate is the percentage of active users who used the feature during the selected period. An active user is a distinct identified (userId) or anonymous (anonymousId) reference with at least one valid event.'`.

### 2. API — Add `feature-adoption` endpoint to AnalyticsController

- [ ] In `apps/api/src/analytics/analytics.controller.ts`:
  - Import `FeatureAdoptionResult` type.
  - Add `@Get('feature-adoption')` method `getFeatureAdoption()`.
  - Reuse `eventActivityQuerySchema` for query validation.
  - Delegate to `analyticsService.getFeatureAdoption()`.

### 3. Web — Add FeatureAdoptionSection to project detail page

- [ ] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add `FeatureAdoptionData` type: `{ features: Array<{ featureId: string, featureName: string, adoptionRate: number, featureUsers: number, totalUsers: number }>, totalActiveUsers: number, startDate: string, endDate: string, definition: string }`.
  - Add `FeatureAdoptionSection` component following the existing section pattern:
    - Period presets (7d/30d/90d) with state.
    - Fetch from `GET .../analytics/feature-adoption?startDate=...&endDate=...` with credentials.
    - Display total active users count and period.
    - Display a table/list of features showing: feature name, adoption rate as percentage (e.g., "42.5%"), numerator ("12 users"), denominator ("28 total users").
    - Show the metric definition.
    - Handle loading, error, empty (no features / no data) states.
    - Empty state: "No features mapped yet. Map events to features to see adoption rates." when no features exist.
    - Zero-users state: "No active users in this period." when denominator is 0.
  - Add the section between `ActiveUsersSection` and `FeaturesSection` with a `<hr>` separator.

### 4. Tests — Unit tests for AnalyticsService

- [ ] In `apps/api/src/analytics/__tests__/analytics.service.spec.ts`:
  - Test `getFeatureAdoption` — non-member throws NotFoundException.
  - Test `getFeatureAdoption` — non-existent project throws NotFoundException.
  - Test `getFeatureAdoption` — returns adoption rates for features with mapped events (mock `$queryRaw` to return per-feature counts, mock `feature.findMany` to return features).
  - Test `getFeatureAdoption` — returns 0% adoption when totalActiveUsers is 0 (division by zero guard).
  - Test `getFeatureAdoption` — returns empty features array when no active features exist.
  - Test `getFeatureAdoption` — returns definition string.
  - Test `getFeatureAdoption` — features sorted by adoption rate descending.

### 5. Tests — Unit tests for AnalyticsController

- [ ] In `apps/api/src/analytics/__tests__/analytics.controller.spec.ts`:
  - Test `getFeatureAdoption` — returns result for valid params.
  - Test `getFeatureAdoption` — throws BadRequestException for missing dates.

## Verification

1. `pnpm --filter api test` — all unit tests pass.
2. `pnpm lint` — pass.
3. `pnpm typecheck` — pass.
4. `pnpm build` — pass.
5. `pnpm format:check` — pass.

## Definition of Done

- [ ] Adoption rate calculated as featureUsers / totalActiveUsers using COALESCE identity rule.
- [ ] Result displayed as percentage rounded to one decimal place.
- [ ] Numerator, denominator, and period visible in API response and UI.
- [ ] Unit tests verify calculation with deterministic mock data (including zero-denominator case).
- [ ] Authorization checks prevent cross-tenant access.
- [ ] Loading, empty, and error states handled in the UI.
- [ ] No unrelated changes introduced.

## Assumptions / open questions

- **Identity resolution:** Same `COALESCE(user_id, anonymous_id)` rule as `getActiveUsers()`. A user is counted once per feature even if they triggered multiple mapped event names for that feature.
- **No ClickHouse:** MVP uses PostgreSQL for analytics queries. Production migration is a separate concern.
- **No custom date range:** Uses the same 7d/30d/90d presets as other analytics sections. Custom date range is US-035.
- **Archived features excluded:** Only ACTIVE features appear in adoption results. Archived features are not shown.
- **Rounding:** Adoption rate rounded to one decimal place (e.g., 42.5%). Stored as number, formatted in UI.
