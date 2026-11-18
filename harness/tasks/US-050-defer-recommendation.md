# US-050 — Defer a recommendation

| Field | Value |
|---|---|
| **Story ID** | US-050 |
| **Epic** | EP-10 Recommendation Review |
| **Priority** | P0 |
| **Status** | Done |
| **Created** | 2026-11-18 |
| **Completed** | 2026-11-18 |

## Story

**As a** product manager, **I want** to defer a recommendation, **so that** I can revisit it later.

## Acceptance criteria

- [x] An authorized user can defer a recommendation.
- [x] The status change is persisted and audited.
- [x] Deferred recommendations can be found using a status filter.
- [x] Recommendation evidence remains accessible.

## Story review

The backend already fully supports the DEFERRED status — it was added during US-048/US-049 as part of the generic `updateStatus` mechanism:
- `DEFERRED` is in `VALID_STATUSES` for filtering
- `ALLOWED_TRANSITIONS` includes `PUBLISHED -> DEFERRED` and `DEFERRED -> PUBLISHED`
- The Zod schema in the controller accepts `'DEFERRED'` in the status enum
- `statusColors` in the web UI already maps DEFERRED to amber

The remaining work is:
1. Add a "Defer" button with optional reason form to the recommendation detail page
2. Add unit tests for DEFERRED transitions
3. Make the status display message specific for deferred recommendations

## Current codebase state

- `apps/api/src/recommendations/recommendations.service.ts` — `updateStatus()` is generic, handles DEFERRED
- `apps/api/src/recommendations/recommendations.controller.ts` — `PATCH /:recommendationId/status` accepts DEFERRED
- `apps/web/src/app/organizations/[id]/projects/[projectId]/recommendations/[recommendationId]/page.tsx` — Has Accept/Reject buttons, no Defer button
- `apps/api/src/recommendations/__tests__/recommendations.service.spec.ts` — Tests for ACCEPTED/REJECTED transitions, none for DEFERRED

## Dependencies

- **Upstream:** US-047 (view recommendations), US-048 (accept), US-049 (reject) — all Done.
- **Downstream:** None.

## Implementation subtasks

### 1. Web UI

- [x] Add `showDeferForm` and `deferReason` state variables
- [x] Add "Defer" button (amber) between Accept and Reject buttons
- [x] Add defer reason form (optional textarea, following reject pattern)
- [x] Wire defer form to `handleStatusChange('DEFERRED', reason)`
- [x] Close defer form when reject form opens and vice versa
- [x] Reset defer state on successful status change
- [x] Update non-PUBLISHED status message to show specific text for DEFERRED

### 2. Unit tests

- [x] Test PUBLISHED -> DEFERRED with reason
- [x] Test PUBLISHED -> DEFERRED without reason
- [x] Test DEFERRED idempotency
- [x] Test DEFERRED -> PUBLISHED (undo deferral)
- [x] Test invalid DEFERRED -> ACCEPTED transition

## Verification

- [x] Unit tests: `pnpm --filter api test` — 309 passed (5 new DEFERRED tests)
- [x] Lint: `pnpm lint` — pass (pre-existing warnings only)
- [x] Typecheck: `pnpm typecheck` — pass
- [x] Build: `pnpm build` — pass
- [x] Format: `pnpm format:check` — pass

## Definition of Done

- [x] The implementation meets the requested behavior and acceptance criteria.
- [x] The solution follows the approved architecture and existing project conventions.
- [x] Changes are limited to the task and necessary related updates.
- [x] Relevant tests have been added or updated.
- [x] Relevant tests and checks have been executed.
- [x] Authorization, tenant isolation, privacy, and security implications have been considered.
- [x] The final report accurately describes changes, verification, and remaining limitations.
