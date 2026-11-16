# US-033 — View feature usage trends

- **Epic:** EP-07 Product Analytics
- **Priority:** P0 (M5 — Product Analytics Dashboard)
- **Source:** `harness/user-stories.md`
- **Status:** Not Started
- **Created:** 2026-11-16

## Story

> **As a** product manager, **I want** to view feature usage over time, **so that** I can understand whether usage is increasing or decreasing.

## Acceptance criteria

- [ ] Usage is displayed over time for a selected feature.
- [ ] A supported date range can be selected.
- [ ] Time buckets are consistent with the range.
- [ ] No-data periods are represented clearly.

## Story review

**Scope boundary:** This story adds a feature usage trends endpoint and a UI section that shows daily event counts for a selected feature over a date range, with a bar chart. It builds on `FeatureEventMapping` (US-028) for mapping features to event names and the existing analytics patterns (US-030/031/032). It does NOT add feature comparison ranking (US-034) or custom date range selection beyond the existing presets (US-035).

**Key decisions:**

- **Usage metric:** Count of valid events whose `event_name` is mapped to the feature during each time bucket. This is total event count (not unique users — that's adoption in US-032).
- **Time buckets:** Daily buckets for all ranges (7d/30d/90d), consistent with `getEventActivity` and `getActiveUsers`. Zero-filled for days with no events.
- **Feature selection:** The endpoint accepts a `featureId` query param. The UI shows a feature selector dropdown. When a feature is selected, its daily usage trend is displayed.
- **Response shape:** `{ featureId, featureName, total, daily: Array<{ date, count }>, startDate, endDate }`.
- **Endpoint:** `GET /organizations/:orgId/projects/:projectId/analytics/feature-usage-trends?startDate=...&endDate=...&featureId=...`. Reuse `eventActivityQuerySchema` extended with `featureId`.
- **Web component:** `FeatureUsageTrendsSection` placed between `FeatureAdoptionSection` and `FeaturesSection`. Feature dropdown, period presets, total count, and daily bar chart matching the existing chart pattern.
- **Only ACTIVE features selectable:** Archived features excluded from dropdown.

**Out of scope:**
- Feature comparison/ranking (US-034)
- Custom date range picker (US-035)
- Weekly/monthly bucket aggregation
- ClickHouse migration

## Current codebase state (verified 2026-11-16)

- `apps/api/src/analytics/analytics.service.ts` — Has `getEventActivity()`, `getActiveUsers()`, `getFeatureAdoption()`. Pattern to follow for the new method.
- `apps/api/src/analytics/analytics.controller.ts` — Controller with `event-activity`, `active-users`, `feature-adoption` endpoints.
- `apps/api/src/analytics/event-activity-query.dto.ts` — Zod schema for `startDate`/`endDate`. Will extend with optional `featureId`.
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — Project detail page with all analytics sections, `PeriodPreset`, `getDateRange()`, `formatDateRange()`, bar chart pattern.
- `packages/database/prisma/schema.prisma` — `Feature`, `FeatureEventMapping`, `Event` models.

## Dependencies

- **Upstream:** US-028 (Done — event-to-feature mapping), US-030 (Done — event activity), US-032 (Done — feature adoption).
- **Downstream:** US-034 (feature comparison).

## Implementation subtasks

### 1. API — Add feature-usage-trends query DTO

- [ ] In `apps/api/src/analytics/event-activity-query.dto.ts`:
  - Add `featureUsageTrendsQuerySchema` extending `eventActivityQuerySchema` with `featureId: z.string().min(1)`.
  - Export the type.

### 2. API — Add `getFeatureUsageTrends` to AnalyticsService

- [ ] In `apps/api/src/analytics/analytics.service.ts`:
  - Add `FeatureUsageTrendsResult` interface: `{ featureId: string, featureName: string, total: number, daily: DailyCount[], startDate: string, endDate: string }`.
  - Add `getFeatureUsageTrends(orgId, projectId, userId, featureId, startDate, endDate)` method:
    1. Verify org membership and project access (same pattern).
    2. Fetch the feature by id, verify it belongs to the project and is ACTIVE.
    3. Fetch the feature's event mappings to get mapped event names.
    4. If no mappings, return zero-filled daily array and total 0.
    5. Query daily event counts via raw SQL:
       ```sql
       SELECT DATE("event_timestamp") AS day, COUNT(*)::bigint AS count
       FROM events
       WHERE "project_id" = $1
         AND "validation_status" = 'VALID'
         AND "event_name" IN (mapped event names)
         AND "event_timestamp" >= $2
         AND "event_timestamp" <= $3
       GROUP BY DATE("event_timestamp")
       ORDER BY day
       ```
    6. Zero-fill the daily array (same pattern as `getEventActivity`).
    7. Return `{ featureId, featureName, total, daily, startDate, endDate }`.

### 3. API — Add `feature-usage-trends` endpoint to AnalyticsController

- [ ] In `apps/api/src/analytics/analytics.controller.ts`:
  - Add `@Get('feature-usage-trends')` method.
  - Use `featureUsageTrendsQuerySchema` for query validation.
  - Delegate to `analyticsService.getFeatureUsageTrends()`.

### 4. Web — Add FeatureUsageTrendsSection to project detail page

- [ ] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add `FeatureUsageTrendsData` type.
  - Add `FeatureUsageTrendsSection` component:
    - Fetch active features list from `GET .../features` (filter ACTIVE client-side).
    - Feature selector dropdown.
    - Period presets (7d/30d/90d).
    - When feature selected, fetch from `GET .../analytics/feature-usage-trends?startDate=...&endDate=...&featureId=...`.
    - Display total count and daily bar chart (same pattern as EventActivitySection).
    - Zero-count days shown as empty bars.
    - Handle loading, error, no-features, no-mappings states.
  - Place between `FeatureAdoptionSection` and `FeaturesSection` with `<hr>` separator.

### 5. Tests — Unit tests for AnalyticsService

- [ ] In `apps/api/src/analytics/__tests__/analytics.service.spec.ts`:
  - Test `getFeatureUsageTrends` — non-member throws NotFoundException.
  - Test `getFeatureUsageTrends` — non-existent project throws NotFoundException.
  - Test `getFeatureUsageTrends` — non-existent feature throws NotFoundException.
  - Test `getFeatureUsageTrends` — returns daily counts with zero-fill.
  - Test `getFeatureUsageTrends` — returns total 0 when no mappings.
  - Test `getFeatureUsageTrends` — returns feature name and id.

### 6. Tests — Unit tests for AnalyticsController

- [ ] In `apps/api/src/analytics/__tests__/analytics.controller.spec.ts`:
  - Test `getFeatureUsageTrends` — returns result for valid params.
  - Test `getFeatureUsageTrends` — throws BadRequestException for missing featureId.

## Verification

1. `pnpm --filter api test` — all unit tests pass.
2. `pnpm lint` — pass.
3. `pnpm typecheck` — pass.
4. `pnpm build` — pass.
5. `pnpm format:check` — pass.

## Definition of Done

- [ ] Daily event counts displayed for a selected feature over the selected period.
- [ ] Period presets (7d/30d/90d) work and update the chart.
- [ ] Days with no events show as zero (no-data clearly represented).
- [ ] Unit tests verify daily count calculation with deterministic mock data.
- [ ] Authorization checks prevent cross-tenant access.
- [ ] Loading, empty, and error states handled in the UI.
- [ ] No unrelated changes introduced.

## Assumptions / open questions

- **Time buckets:** Daily for all ranges. Weekly/monthly aggregation deferred.
- **No ClickHouse:** MVP uses PostgreSQL for analytics queries.
- **Feature must be ACTIVE:** Archived features not selectable for trend view.
- **Usage = event count:** Not unique users (that's adoption). This shows raw event volume.
- **IN clause for event names:** Uses Prisma's `Prisma.join()` for safe parameterized IN clause in raw SQL.
