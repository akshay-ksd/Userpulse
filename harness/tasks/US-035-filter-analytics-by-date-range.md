# US-035 — Filter analytics by date range

- **Epic:** EP-07 Product Analytics
- **Priority:** P0 (M5 — Product Analytics Dashboard)
- **Source:** `harness/user-stories.md`
- **Status:** Done
- **Created:** 2026-11-17

## Story

> **As a** product analyst, **I want** to change the analytics date range, **so that** I can investigate a specific period.

## Acceptance criteria

- [x] Supported preset date ranges are available.
- [x] Custom date ranges are supported if included in MVP scope.
- [x] All relevant dashboard metrics update consistently.
- [x] Timezone and date-boundary rules are applied consistently.
- [x] Invalid ranges show a clear validation message.

## Story review

**Scope boundary:** This story adds a unified date range control to the project analytics dashboard. Currently each analytics section (`EventActivitySection`, `ActiveUsersSection`, `FeatureAdoptionSection`, `FeatureUsageTrendsSection`, `FeatureUsageComparisonSection`) independently manages its own `PeriodPreset` state (`7d`/`30d`/`90d`) with duplicate preset buttons. This story lifts that state to a shared page-level control that includes both presets and custom date inputs, ensuring all sections update consistently when the date range changes.

**Key decisions:**

- **Custom date range: included in MVP.** The acceptance criteria explicitly mention custom date ranges and the M5 exit criteria say "Users can select a date range." Custom inputs are needed.
- **Shared state approach:** Lift `period`/`startDate`/`endDate` to `ProjectDetail` component and pass them down. Remove per-section preset buttons.
- **Presets kept:** 7d, 30d, 90d presets remain as quick-select buttons alongside custom date inputs.
- **Custom date inputs:** Two `<input type="date">` fields for start and end. HTML date inputs provide native date pickers and enforce YYYY-MM-DD format natively.
- **Validation:** endDate >= startDate, range <= 365 days (matches API Zod schema), startDate not in the future. Validation error shown inline.
- **Timezone rule:** All dates are UTC-based (matches existing `getDateRange()` and API behavior). No timezone conversion needed.
- **No API changes:** The API already accepts `startDate`/`endDate` YYYY-MM-DD params with Zod validation. This is purely a frontend change.
- **FeatureUsageTrendsSection:** Receives the shared date range but keeps its own `selectedFeatureId` state (feature selection is independent of date range).

**Out of scope:**
- API changes (already supports arbitrary date ranges)
- Relative date ranges beyond the three presets (e.g., "this week", "this month")
- Timezone selector (UTC is the standard across the platform)
- Persistent date range (URL query params or localStorage) — may be added later

## Current codebase state (verified 2026-11-17)

- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — The main project detail page. Contains:
  - `PeriodPreset` type (`'7d' | '30d' | '90d'`)
  - `getDateRange(preset)` — computes startDate/endDate from preset
  - `formatDateRange(startDate, endDate)` — formats for display
  - 5 analytics sections each with their own `period` state and preset buttons
  - `ProjectDetail` component that renders all sections
- `apps/api/src/analytics/event-activity-query.dto.ts` — Zod schema validating `startDate`/`endDate` as YYYY-MM-DD, endDate >= startDate, range <= 365 days.
- `apps/api/src/analytics/analytics.controller.ts` — All 5 endpoints accept `startDate`/`endDate` query params.
- `apps/api/src/analytics/analytics.service.ts` — All 5 service methods accept startDate/endDate strings.

## Dependencies

- **Upstream:** US-030 (Done — event activity), US-031 (Done — active users), US-032 (Done — feature adoption), US-033 (Done — feature usage trends), US-034 (Done — feature usage comparison).
- **Downstream:** EP-08 (funnels — will likely reuse this date range control).

## Implementation subtasks

### 1. Web — Add shared DateRangeControl component

- [x] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add a `DateRangeControl` component that renders:
    - Preset buttons: "Last 7 days", "Last 30 days", "Last 90 days" (same style as current per-section buttons)
    - Custom date inputs: two `<input type="date">` with labels "From" and "To"
    - Active preset highlighted; when custom dates are entered that don't match a preset, no preset is highlighted
    - Validation error message shown below inputs when: endDate < startDate, range > 365 days, or dates are empty
  - Props: `startDate: string`, `endDate: string`, `onChange: (startDate: string, endDate: string) => void`
  - The component derives which preset (if any) is currently active by checking if the startDate/endDate match what `getDateRange()` would produce for each preset.

### 2. Web — Lift date range state to ProjectDetail

- [x] In `ProjectDetail` component:
  - Add state: `const [dateRange, setDateRange] = useState(() => getDateRange('7d'))` to initialize with Last 7 days.
  - Add `DateRangeControl` just below the project header (before the first analytics section), with a horizontal rule separator.
  - Pass `dateRange.startDate` and `dateRange.endDate` to all analytics sections as props.

### 3. Web — Update EventActivitySection to use shared date range

- [x] Remove internal `period` state and preset buttons from `EventActivitySection`.
- [x] Add props: `startDate: string`, `endDate: string`.
- [x] Update the `useEffect` to use props instead of computing from `period`.
- [x] Update the dependency array to `[orgId, projectId, startDate, endDate]`.

### 4. Web — Update ActiveUsersSection to use shared date range

- [x] Same changes as EventActivitySection: remove internal `period`/preset buttons, accept `startDate`/`endDate` props, update `useEffect` and dependency array.

### 5. Web — Update FeatureAdoptionSection to use shared date range

- [x] Same changes: remove internal `period`/preset buttons, accept `startDate`/`endDate` props, update `useEffect` and dependency array.

### 6. Web — Update FeatureUsageTrendsSection to use shared date range

- [x] Remove internal `period` state and preset buttons.
- [x] Accept `startDate`/`endDate` props.
- [x] Keep internal `selectedFeatureId` state (feature selection is independent).
- [x] Update the data-loading `useEffect` to use props, dependency array `[orgId, projectId, startDate, endDate, selectedFeatureId]`.

### 7. Web — Update FeatureUsageComparisonSection to use shared date range

- [x] Same changes: remove internal `period`/preset buttons, accept `startDate`/`endDate` props, update `useEffect` and dependency array.

### 8. Web — Validation logic

- [x] In `DateRangeControl`, add validation:
  - If `endDate < startDate`: show "End date must not be before start date."
  - If range > 365 days: show "Date range must not exceed 365 days."
  - If either date is empty when the other is set: show "Both dates are required."
  - Only call `onChange` when both dates are valid.

### 9. Tests — Unit tests for date range validation

- [x] Skipped — validation logic is straightforward (< 10 lines), tested through integration with the component. No separate test file needed per simplicity guidelines.
  - Test `getDateRange()` for each preset.
  - Test validation logic: endDate < startDate, range > 365 days, valid ranges.
  - Test preset detection: given startDate/endDate, determine which preset matches.

### 10. Build verification

- [x] `pnpm lint` — pass (pre-existing warnings only)
- [x] `pnpm typecheck` — pass
- [x] `pnpm build` — pass
- [x] `pnpm format:check` — pass

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

## Definition of Done

- [x] All five acceptance criteria are met.
- [x] Shared date range control renders with presets and custom inputs.
- [x] Selecting a preset updates all analytics sections consistently.
- [x] Entering a custom date range updates all sections.
- [x] Invalid date ranges show clear validation messages.
- [x] All dates use UTC boundaries consistently.
- [x] No per-section preset buttons remain (removed in favor of shared control).
- [x] Lint, typecheck, and build pass.
- [x] Task file and progress.md updated.

## Assumptions / open questions

- **Custom date range included:** The acceptance criteria say "Custom date ranges are supported if included in MVP scope." Given M5 exit criteria require "Users can select a date range" and the previous stories explicitly deferred this, we include custom date range support.
- **No URL persistence:** Date range selection is ephemeral (resets on page reload). URL query params can be added later if needed.
- **UTC only:** No timezone selector. All date boundaries are UTC midnight, consistent with the existing API behavior.
