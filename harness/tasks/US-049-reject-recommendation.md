# US-049 — Reject a recommendation

- **Epic:** EP-10 Recommendation Review
- **Priority:** P0
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-18)
- **Created:** 2026-11-18

## Story

> **As a** product manager, **I want** to reject a recommendation, **so that** irrelevant suggestions leave the active review queue.

## Acceptance criteria

- [x] An authorized user can reject a recommendation.
- [x] A rejection reason can be recorded.
- [x] Status and decision timestamp are persisted.
- [x] The action is recorded in status history.
- [x] Rejected items are distinguishable from active recommendations.

## Story review

**Scope boundary:** This story adds the ability to reject a recommendation (PUBLISHED → REJECTED) with an optional reason. The API endpoint and status history infrastructure were built in US-048; this story adds web UI (reject button, reason input) and specific test coverage for the rejection flow.

**Key decisions:**

- **API reuse.** The existing `PATCH .../recommendations/:id/status` endpoint already accepts `{ status: 'REJECTED', reason?: string }`. No new API code needed.
- **Reason input.** Add an optional textarea for rejection reason, shown when user clicks "Reject". This provides context for why the recommendation was dismissed.
- **UI pattern.** Add a "Reject" button alongside the existing "Accept" button on the detail page. Reject uses a red color scheme to distinguish from accept (green).
- **Distinguishability.** Rejected recommendations already have a red status badge (`REJECTED` in `statusColors`). The status info panel already shows "This recommendation has been reviewed" for non-PUBLISHED statuses.

## Current codebase state (verified 2026-11-18)

- **API:** `RecommendationsController` has `PATCH :recommendationId/status` accepting `{ status: 'ACCEPTED' | 'REJECTED' | 'DEFERRED' | 'PUBLISHED', reason?: string }`. `RecommendationsService.updateStatus()` handles PUBLISHED → REJECTED transition, creates history entry with reason. Fully functional.
- **Web:** Detail page at `apps/web/src/app/organizations/[id]/projects/[projectId]/recommendations/[recommendationId]/page.tsx` has `handleStatusChange(newStatus)` function and an "Accept" button. No "Reject" button exists.
- **Tests:** `recommendations.service.spec.ts` has `updateStatus` tests for ACCEPTED flow but not specifically for REJECTED with reason.

## Dependencies

- Upstream: US-048 (done) — status update endpoint and history model exist.
- Downstream: US-050 (defer) will follow the same pattern.

## Implementation subtasks

### 1. API — Add unit tests for rejection flow

- [x] Test PUBLISHED → REJECTED with reason: verify history entry includes reason.
- [x] Test PUBLISHED → REJECTED without reason: verify reason is null in history.
- [x] Test REJECTED → REJECTED idempotency: returns unchanged, no duplicate history.

### 2. Web — Add Reject button with reason input to detail page

- [x] Add "Reject" button next to "Accept" in the PUBLISHED action area.
- [x] Add optional reason textarea that appears when "Reject" is clicked (before confirming).
- [x] On confirm, call `handleStatusChange` variant that sends `{ status: 'REJECTED', reason }`.
- [x] Handle loading state and errors.

### 3. Verification

- [x] `pnpm --filter api test` — 304 passed (3 new rejection tests).
- [x] `pnpm lint` — pass (pre-existing warnings only).
- [x] `pnpm typecheck` — pass.
- [x] `pnpm build` — pass.
- [x] `pnpm format:check` — pass.

## Definition of Done

- [x] An authorized user can reject a recommendation via the UI.
- [x] An optional rejection reason is sent with the status change.
- [x] Status and timestamp are persisted via existing API.
- [x] A history entry records the user, timestamp, reason, and transition.
- [x] Rejected items show a distinct red status badge.
- [x] Tests pass and code follows project conventions.
