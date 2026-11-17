# US-040 — Identify significant activity changes

- **Epic:** EP-08 Funnels and Behavioral Insights
- **Priority:** P0 (M6 — Funnels and Behavioral Insights)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-17)
- **Created:** 2026-11-17

## Story

> **As a** product manager, **I want** to see notable increases or decreases in activity, **so that** I can investigate changes in behavior.

## Acceptance criteria

- [x] Activity is compared against a defined baseline.
- [x] Metric, direction, magnitude, and period are displayed.
- [x] Comparison method is documented.
- [x] Low-volume data is handled cautiously.
- [x] The platform does not claim a cause without evidence.

## Story review

**Scope boundary:** This story adds a read-only "Activity Changes" endpoint and UI section that compares event activity in the selected period against a baseline (the equal-length preceding period). It identifies significant increases or decreases in total event counts and per-event-name counts. This is a deterministic insight — no AI involved, no causal claims.

**Key decisions:**

- **Baseline definition:** The baseline is the same-length period immediately preceding the selected date range. For example, if the user selects Nov 8–14, the baseline is Nov 1–7.
- **Metrics compared:** Total event count and per-event-name event counts.
- **Significance threshold:** A change is considered significant if the absolute percentage change exceeds 30% AND the combined volume (current + baseline) is at least 10 events. This avoids flagging noise from very low-volume events.
- **Low-volume handling:** If the baseline period has fewer than 5 total events, the result is marked `insufficientData: true`. Per-event-name entries with combined volume < 10 are marked `lowVolume: true` and not classified as significant.
- **Direction and magnitude:** Each change entry includes `direction: 'increase' | 'decrease' | 'unchanged'` and `percentChange` (rounded to 1 decimal). 
- **No causal claims:** The response includes a `method` string explaining the comparison approach. No explanations for why changes occurred.
- **Comparison method string:** Included in the response so the UI can display how changes are determined.

**Out of scope:**
- AI-generated explanations for changes
- Alerting or notifications
- Statistical significance testing (simple percentage comparison for MVP)
- Configurable thresholds

## Current codebase state (verified 2026-11-17)

- **AnalyticsModule** (`apps/api/src/analytics/`): Controller with event-activity, active-users, feature-adoption, feature-usage-comparison, feature-usage-trends, user-journeys, feature-usage-insights endpoints. Service uses raw SQL via PrismaService.
- **Query DTO** (`event-activity-query.dto.ts`): `eventActivityQuerySchema` with startDate/endDate. Reusable for this endpoint.
- **Web project page** (`apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`): Large single-file component with inline section components. New section goes after `FeatureUsageInsightsSection`.
- **Test patterns**: Unit tests mock Prisma service calls; e2e tests not runnable (no PostgreSQL).

## Dependencies

- **Upstream:** US-030 (event activity — Done), US-035 (date filter — Done). All satisfied.
- **Downstream:** EP-09 AI recommendations may reference activity change data.

## Implementation subtasks

### 1. API — Add activity changes types and service method

- [ ] In `apps/api/src/analytics/analytics.service.ts`:
  - Add `ActivityChangeEntry` interface: `{ eventName: string; currentCount: number; baselineCount: number; direction: 'increase' | 'decrease' | 'unchanged'; percentChange: number; lowVolume: boolean }`.
  - Add `ActivityChangesResult` interface: `{ overall: { currentTotal: number; baselineTotal: number; direction: 'increase' | 'decrease' | 'unchanged'; percentChange: number }; changes: ActivityChangeEntry[]; significantChanges: ActivityChangeEntry[]; currentPeriod: { startDate: string; endDate: string }; baselinePeriod: { startDate: string; endDate: string }; method: string; insufficientData: boolean; insufficientDataReason?: string }`.
  - Add `ACTIVITY_CHANGES_METHOD` constant describing the comparison approach.
  - Add `getActivityChanges(orgId, projectId, userId, startDate, endDate)` method:
    1. Verify org membership and project access (same pattern as other methods).
    2. Calculate baseline period: same-length period immediately before `startDate`.
    3. Query total events and per-event-name counts for both current and baseline periods via raw SQL.
    4. If baseline total < 5 events, return with `insufficientData: true`.
    5. Calculate overall percentage change.
    6. For each event name present in either period, calculate direction and percentage change.
    7. Mark entries with combined volume < 10 as `lowVolume: true`.
    8. Filter `significantChanges`: entries with |percentChange| > 30 AND not lowVolume.
    9. Sort significant changes by absolute percentChange descending.
    10. Return all data with method documentation.

### 2. API — Add controller endpoint

- [ ] In `apps/api/src/analytics/analytics.controller.ts`:
  - Add `GET activity-changes` endpoint using `eventActivityQuerySchema`.
  - Import `ActivityChangesResult`.
  - Follow the same pattern as `getFeatureUsageInsights` endpoint.

### 3. API — Unit tests

- [ ] In `apps/api/src/analytics/__tests__/analytics.service.spec.ts`:
  - Test: non-member throws NotFoundException.
  - Test: missing project throws NotFoundException.
  - Test: happy path with increases and decreases identified.
  - Test: insufficient data when baseline has < 5 events.
  - Test: low-volume events marked correctly.
  - Test: event names appearing only in current or only in baseline handled.
  - Test: no significant changes when all within threshold.

### 4. Web — Add ActivityChangesSection

- [ ] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add `ActivityChangesData` type matching the API response.
  - Add `ActivityChangesSection` component following the same pattern as `FeatureUsageInsightsSection`:
    - Fetches `GET .../analytics/activity-changes?startDate=...&endDate=...`
    - Loading, error, empty states.
    - Shows method description (togglable with "?" button).
    - Shows overall activity change summary (current vs baseline, direction arrow, percentage).
    - Shows baseline period info.
    - Table of significant changes: event name, current count, baseline count, direction badge (green up arrow for increase, red down arrow for decrease), percentage change.
    - Low-volume and insufficient-data messages.
  - Add the section after `FeatureUsageInsightsSection` in the main render.

### 5. API — Controller test

- [ ] In `apps/api/src/analytics/__tests__/analytics.controller.spec.ts`:
  - Add test for `activity-changes` endpoint (validation, happy path).

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

- 30% change threshold is reasonable for MVP. No configurability needed.
- Baseline is always the preceding equal-length period (no custom baseline selection).
- Combined volume threshold of 10 events prevents noise from very-low-traffic event names.
- Baseline minimum of 5 total events prevents meaningless comparisons.
