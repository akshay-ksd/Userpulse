# US-047 — View recommendations

- **Epic:** EP-10 Recommendation Review
- **Priority:** P0
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-18)
- **Created:** 2026-11-18

## Story

> **As a** product manager, **I want** to view recommendations for my project, **so that** I can review potential improvements.

## Acceptance criteria

- [x] Only recommendations for the selected authorized project are shown. — `verifyProjectAccess` checks membership; API scopes by projectId.
- [x] List items show title, summary, status, and date. — Status badge and creation date added to list items.
- [x] Supported status filters are available. — Button group: All, Published, Accepted, Rejected, Deferred.
- [x] Selecting an item opens its detail view. — Title links to `/recommendations/[id]` detail page; "View" link also available.
- [x] An empty state appears when no recommendations exist. — Context-aware empty state (filter-specific or general).

## Story review

**Scope boundary:** This story enhances the existing recommendations list with status filtering and a dedicated detail view. The existing `RecommendationsSection` already shows recommendations with title, summary, category, and priority; this story adds status display, status filtering, and a navigable detail view. It does not add review actions (US-048–050).

**Key decisions:**

- **Status filtering.** Add a `status` query parameter to `GET /organizations/:orgId/projects/:projectId/recommendations`. The API currently hardcodes `status: 'PUBLISHED'`; change to accept an optional status filter. Supported statuses: `PUBLISHED`, `ACCEPTED`, `REJECTED`, `DEFERRED` (the review statuses from US-048–050 will add these; for now PUBLISHED is the only status in use, but the filter and UI should support all).
- **Detail view.** Add a dedicated route `/organizations/[id]/projects/[projectId]/recommendations/[recommendationId]` page that fetches `GET .../recommendations/:recommendationId` and shows full detail including evidence, confidence/impact, and suggested action.
- **List enhancement.** Update `RecommendationsSection` to show status badges, add a status filter dropdown, and make items clickable links to the detail page.
- **Empty state.** Already exists ("No recommendations yet...") — keep it.
- **No new DB migration.** The `Recommendation` model already has a `status` field.

## Current codebase state

- **API:** `RecommendationsController` at `apps/api/src/recommendations/recommendations.controller.ts` — `GET /` (list) and `GET /:recommendationId` (detail). `RecommendationsService` at `recommendations.service.ts` — `findByProject` hardcodes `status: 'PUBLISHED'`; `findOne` returns any status.
- **Web:** `RecommendationsSection` in `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` (line 3519) — fetches and displays recommendations inline on the project page. Already shows title, summary, category, priority score, evidence, and suggested action via expand/collapse.
- **DB:** `Recommendation` model has `status String @default("PUBLISHED")` — no migration needed.

## Dependencies

- Upstream: US-042 (done), US-043 (done), US-044 (done), US-045 (done), US-046 (done).
- Downstream: US-048, US-049, US-050 (review actions will use the status filter and detail view).

## Implementation subtasks

### 1. API — Add status filter to list endpoint

- [x] Update `RecommendationsController.list()` to accept an optional `status` query parameter.
- [x] Update `RecommendationsService.findByProject()` to filter by status when provided; default to returning all recommendations when no filter given.
- [x] Valid statuses defined as a static constant in service: `['PUBLISHED', 'ACCEPTED', 'REJECTED', 'DEFERRED']`.

### 2. API — Unit tests

- [x] Test `findByProject` with no status filter returns all recommendations.
- [x] Test `findByProject` with `status=PUBLISHED` returns only published.
- [x] Test `findByProject` with invalid status ignores the filter.

### 3. Web — Add status filter to RecommendationsSection

- [x] Add a status filter button group above the recommendations list. Options: All, Published, Accepted, Rejected, Deferred.
- [x] Pass selected status as query parameter to the API fetch.
- [x] Update the empty state to reflect the active filter.

### 4. Web — Add status badge to list items

- [x] Show a status badge (PUBLISHED = blue, ACCEPTED = green, REJECTED = red, DEFERRED = amber) alongside the category badge.
- [x] Show the recommendation creation date.

### 5. Web — Create recommendation detail page

- [x] Create `apps/web/src/app/organizations/[id]/projects/[projectId]/recommendations/[recommendationId]/page.tsx`.
- [x] Fetch `GET /organizations/:orgId/projects/:projectId/recommendations/:recommendationId`.
- [x] Display: title, category, status badge, date, summary, suggested action, evidence section, confidence/impact/reach/priority scores.
- [x] Handle loading, error, not-found, and 401 states.
- [x] Add a back link to the project page.

### 6. Web — Make list items link to detail view

- [x] Wrap recommendation titles in `<Link>` to `/organizations/${orgId}/projects/${projectId}/recommendations/${rec.id}`.
- [x] Keep the existing expand/collapse for quick view, plus a "View" link.

### 7. Verification

- [x] `pnpm --filter api test` — 296 passed.
- [x] `pnpm lint` — pass (pre-existing warnings only).
- [x] `pnpm typecheck` — pass.
- [x] `pnpm build` — pass.
- [x] `pnpm format:check` — pass.

## Definition of Done

- [x] All acceptance criteria met.
- [x] Follows approved architecture and existing project conventions.
- [x] Changes limited to task scope.
- [x] Tests added or updated.
- [x] Checks executed and passing.
- [x] Authorization and tenant isolation verified.
- [x] Final report accurate.

## Assumptions / open questions

- Status values `ACCEPTED`, `REJECTED`, `DEFERRED` don't exist in recommendations yet (all are `PUBLISHED`). The filter UI and API support them in advance of US-048–050.
- The detail page reuses evidence display logic from the existing inline expand.
- No pagination for the recommendations list (same as current behavior).
