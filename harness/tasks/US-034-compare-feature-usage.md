# US-034 — Compare feature usage

- **Epic:** EP-07 Product Analytics
- **Priority:** P0 (M5 — Product Analytics Dashboard)
- **Source:** `harness/user-stories.md`
- **Status:** Done
- **Created:** 2026-11-16

## Story

> **As a** product manager, **I want** to compare feature usage, **so that** I can identify features with high or low engagement.

## Acceptance criteria

- [x] Mapped features are ranked by usage for the selected period.
- [x] Ranking metric and date range are visible.
- [x] Features with no activity are handled consistently.
- [x] The user can open a feature detail view.

## Story review

**Scope boundary:** This story adds a feature usage comparison endpoint and a UI section that ranks all active features by total event count for the selected period. It builds on `FeatureEventMapping` (US-028) and existing analytics patterns (US-030–033). It does NOT add custom date range selection (US-035) or funnel/behavioral insights (EP-08).

**Key decisions:**

- **Usage metric:** Total valid event count per feature for the period. This is total events (not unique users — that's adoption in US-032).
- **Ranking:** Features sorted by total event count descending. Features with zero events appear at the bottom.
- **Response shape:** `{ features: Array<{ featureId, featureName, totalEvents }>, startDate, endDate, metric }`.
- **Endpoint:** `GET /organizations/:orgId/projects/:projectId/analytics/feature-usage-comparison?startDate=...&endDate=...`. Reuse `eventActivityQuerySchema`.
- **Web component:** `FeatureUsageComparisonSection` placed between `FeatureUsageTrendsSection` and `FeaturesSection`. Shows a horizontal bar chart ranking features by event count. Each feature row links to the feature usage trends view (by selecting it in the trends dropdown).
- **Only ACTIVE features:** Archived features excluded.
- **Zero-event features:** Shown with 0 count and no bar, clearly showing they had no activity.

**Out of scope:**
- Custom date range picker (US-035)
- Funnel/behavioral insights (EP-08)
- ClickHouse migration

## Current codebase state (verified 2026-11-16)

- `apps/api/src/analytics/analytics.service.ts` — Has `getEventActivity()`, `getActiveUsers()`, `getFeatureAdoption()`, `getFeatureUsageTrends()`. Pattern to follow for the new method.
- `apps/api/src/analytics/analytics.controller.ts` — Controller with `event-activity`, `active-users`, `feature-adoption`, `feature-usage-trends` endpoints.
- `apps/api/src/analytics/event-activity-query.dto.ts` — Zod schema for `startDate`/`endDate`. Reusable for this endpoint.
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — Project detail page with all analytics sections, `PeriodPreset`, `getDateRange()`, `formatDateRange()`, bar chart pattern.
- `packages/database/prisma/schema.prisma` — `Feature`, `FeatureEventMapping`, `Event` models.

## Dependencies

- **Upstream:** US-028 (Done — event-to-feature mapping), US-030 (Done — event activity), US-032 (Done — feature adoption), US-033 (Done — feature usage trends).
- **Downstream:** US-035 (date range filtering).

## Implementation subtasks

### 1. API — Add `FeatureUsageComparisonResult` interface and `getFeatureUsageComparison` to AnalyticsService

- [x] In `apps/api/src/analytics/analytics.service.ts`:
  - Add `FeatureUsageComparisonEntry` interface: `{ featureId: string, featureName: string, totalEvents: number }`.
  - Add `FeatureUsageComparisonResult` interface: `{ features: FeatureUsageComparisonEntry[], startDate: string, endDate: string, metric: string }`.
  - Add `getFeatureUsageComparison(orgId, projectId, userId, startDate, endDate)` method:
    1. Verify org membership and project access (same pattern).
    2. Compute date range boundaries.
    3. Query per-feature event counts via raw SQL joining `events` with `feature_event_mappings`.
    4. Fetch active features for the project.
    5. Build features array with event counts, zero for unmapped/inactive.
    6. Sort by totalEvents descending.
    7. Return `{ features, startDate, endDate, metric }`.

### 2. API — Add `feature-usage-comparison` endpoint to AnalyticsController

- [x] In `apps/api/src/analytics/analytics.controller.ts`:
  - Add `@Get('feature-usage-comparison')` method.
  - Reuse `eventActivityQuerySchema` for query validation.
  - Delegate to `analyticsService.getFeatureUsageComparison()`.

### 3. API — Add unit tests

- [x] In `apps/api/src/analytics/analytics.service.spec.ts`:
  - Add tests for `getFeatureUsageComparison`: happy path, no features, non-member rejection.

### 4. Web — Add FeatureUsageComparisonSection to project detail page

- [x] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add `FeatureUsageComparisonData` type.
  - Add `FeatureUsageComparisonSection` component:
    - Period presets (7d/30d/90d).
    - Fetch from `GET .../analytics/feature-usage-comparison?startDate=...&endDate=...`.
    - Display ranked list with horizontal bars showing relative usage.
    - Show metric name and date range.
    - Empty state for no features.
    - Zero-event features shown consistently.
  - Place between `FeatureUsageTrendsSection` and `FeaturesSection`.

## Verification

```bash
pnpm --filter api test
pnpm --filter api test:e2e   # if PostgreSQL available
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

## Definition of Done

- [x] Implementation meets acceptance criteria.
- [x] Solution follows approved architecture and existing patterns.
- [x] Changes are scoped to this task.
- [x] Relevant tests added.
- [x] Verification checks run and pass.
- [x] Authorization and tenant isolation considered.
- [x] No unrelated changes introduced.

## Assumptions / open questions

- Usage metric is total event count (not unique users). This distinguishes it from feature adoption (US-032) which uses unique user counts.
- Feature detail view navigation: clicking a feature selects it in the FeatureUsageTrendsSection dropdown rather than navigating to a separate page.
