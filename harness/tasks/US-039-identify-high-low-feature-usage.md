# US-039 — Identify high or low feature usage

- **Epic:** EP-08 Funnels and Behavioral Insights
- **Priority:** P0 (M6 — Funnels and Behavioral Insights)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-17)
- **Created:** 2026-11-17

## Story

> **As a** product manager, **I want** to see features with unusually high or low usage, **so that** I can investigate potential opportunities.

## Acceptance criteria

- [x] Features meeting documented high- or low-usage rules are identified.
- [x] Each insight includes feature, metric, and period.
- [x] Comparison baseline is visible.
- [x] Insufficient data is labeled.
- [x] Insights are derived from deterministic analytics.

## Story review

**Scope boundary:** This story adds a read-only "Feature Usage Insights" endpoint and UI section that identifies features with notably high or low usage relative to the project's overall feature usage. This is a deterministic insight — no AI involved.

**Key decisions:**

- **High/low usage rules:** Compare each feature's event count to the mean event count across all active features in the period. Features above 2× the mean are "high usage"; features below 0.25× the mean are "low usage". These thresholds are documented in the response. Features within range are "normal".
- **Metric:** Total valid events per feature (same as feature-usage-comparison). The mean across all active features with mapped events is the baseline.
- **Insufficient data:** Features with zero events are labeled `insufficientData: true` rather than classified. Projects with fewer than 2 features with data produce an empty insights array with an `insufficientData` message.
- **Existing endpoint reuse:** This builds on the same feature-event-mapping join used in `getFeatureUsageComparison` and `getFeatureAdoption`. It queries the same data with added classification logic.
- **API pattern:** `GET .../analytics/feature-usage-insights` on `AnalyticsController`, using the standard date range query schema.
- **Web pattern:** `FeatureUsageInsightsSection` added to the project page, following the same pattern as other analytics sections.

**Out of scope:**
- Configurable thresholds (use documented defaults)
- Trend-based insight (covered by US-040)
- AI-generated explanations
- Alerting or notifications

## Current codebase state (verified 2026-11-17)

- **AnalyticsModule** (`apps/api/src/analytics/`): Controller with event-activity, active-users, feature-adoption, feature-usage-comparison, feature-usage-trends, user-journeys endpoints. Service uses raw SQL via PrismaService.
- **Feature event mappings**: `feature_event_mappings` table joins features to event names, used in adoption and comparison queries.
- **Query DTO** (`event-activity-query.dto.ts`): `eventActivityQuerySchema` with startDate/endDate. Reusable for this endpoint.
- **Web project page** (3133 lines): Large single-file component with inline section components.
- **Test patterns**: Unit tests mock Prisma service calls; e2e tests not runnable (no PostgreSQL).

## Dependencies

- **Upstream:** US-026 (features — Done), US-028 (event mapping — Done), US-030 (event activity — Done), US-034 (feature comparison — Done), US-035 (date filter — Done). All satisfied.
- **Downstream:** US-040 (activity changes) is independent. EP-09 AI recommendations may reference usage insights.

## Implementation subtasks

### 1. API — Add feature usage insights types and service method

- [ ] In `apps/api/src/analytics/analytics.service.ts`:
  - Add `FeatureUsageInsight` interface: `{ featureId: string; featureName: string; totalEvents: number; classification: 'high' | 'low' | 'normal'; insufficientData: boolean }`.
  - Add `FeatureUsageInsightsResult` interface: `{ insights: FeatureUsageInsight[]; meanEvents: number; highThreshold: number; lowThreshold: number; totalFeatures: number; featuresWithData: number; startDate: string; endDate: string; method: string; insufficientData: boolean; insufficientDataReason?: string }`.
  - Add `getFeatureUsageInsights(orgId, projectId, userId, startDate, endDate)` method:
    1. Verify org membership and project access (same pattern as other methods).
    2. Query total events per feature via feature_event_mappings join (same as getFeatureUsageComparison).
    3. Get all active features for the project.
    4. Calculate mean event count across features with data (> 0 events).
    5. If fewer than 2 features with data, return empty insights with `insufficientData: true` and reason.
    6. Classify each feature: > 2× mean → 'high', < 0.25× mean → 'low', else 'normal'. Features with 0 events get `insufficientData: true` and 'low' classification.
    7. Sort by totalEvents descending. Return insights, mean, thresholds, period.

### 2. API — Add controller endpoint

- [ ] In `apps/api/src/analytics/analytics.controller.ts`:
  - Add `GET feature-usage-insights` endpoint using `eventActivityQuerySchema`.
  - Import `FeatureUsageInsightsResult`.
  - Follow the exact same pattern as `getFeatureAdoption` endpoint.

### 3. API — Unit tests

- [ ] In `apps/api/src/analytics/__tests__/analytics.service.spec.ts`:
  - Test: non-member throws NotFoundException.
  - Test: missing project throws NotFoundException.
  - Test: happy path with features classified as high/low/normal.
  - Test: insufficient data when < 2 features have events.
  - Test: features with zero events labeled insufficientData.
  - Test: empty features returns empty insights.

### 4. Web — Add FeatureUsageInsightsSection

- [ ] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add `FeatureUsageInsightsData` type matching the API response.
  - Add `FeatureUsageInsightsSection` component following the same pattern as `FeatureAdoptionSection`:
    - Fetches `GET .../analytics/feature-usage-insights?startDate=...&endDate=...`
    - Loading, error, empty states.
    - Shows method description (togglable with "?" button).
    - Shows baseline info: mean events, thresholds.
    - Table with feature name, total events, classification badge (green for high, amber for low, gray for normal, with "insufficient data" label).
    - Insufficient data message when project-level data is insufficient.
  - Add the section between UserJourneysSection and FeaturesSection in the main render.

### 5. API — Controller test

- [ ] In `apps/api/src/analytics/__tests__/analytics.controller.spec.ts`:
  - Add test for `feature-usage-insights` endpoint (validation, happy path).

## Verification

```bash
pnpm --filter api test          # Unit tests
pnpm lint                       # Lint
pnpm typecheck                  # Type check
pnpm build                      # Build
pnpm format:check               # Format
```

## Definition of Done

- [ ] All acceptance criteria implemented and verified.
- [ ] Solution follows existing analytics patterns.
- [ ] Changes scoped to the task.
- [ ] Unit tests added.
- [ ] All checks pass.
- [ ] Authorization and tenant isolation verified.
- [ ] Progress.md updated.

## Assumptions

- High/low thresholds (2× mean / 0.25× mean) are reasonable defaults. No configurability needed for MVP.
- Mean is calculated over features with > 0 events only, so zero-event features don't drag the mean down.
- The classification method string is included in the API response so the UI can display how insights are determined.
