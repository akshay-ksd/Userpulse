# US-048 — Accept a recommendation

- **Epic:** EP-10 Recommendation Review
- **Priority:** P0
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-18)
- **Created:** 2026-11-18

## Story

> **As a** product manager, **I want** to mark a recommendation as accepted, **so that** my team can consider it for implementation.

## Acceptance criteria

- [x] An authorized user can accept a recommendation.
- [x] The status is persisted.
- [x] User and timestamp are recorded.
- [x] List and detail views reflect the new status.
- [x] Repeated requests do not create duplicate history entries.

## Story review

**Scope boundary:** This story adds the ability to transition a recommendation's status to ACCEPTED. It introduces a `RecommendationStatusHistory` table to track who changed what and when, and an API endpoint to perform the transition. It does not cover reject (US-049) or defer (US-050), though the infrastructure built here (history model, status update endpoint) will be reused by those stories.

**Key decisions:**

- **Status history model.** Create a `RecommendationStatusHistory` table with `id`, `recommendationId`, `fromStatus`, `toStatus`, `changedBy` (userId), `reason` (nullable, for future use by reject/defer), `createdAt`. This tracks all status transitions with audit trail.
- **Idempotency.** If a recommendation is already ACCEPTED, the endpoint returns success without creating a duplicate history entry. This satisfies the "repeated requests do not create duplicate history entries" criterion.
- **Endpoint.** `PATCH /organizations/:orgId/projects/:projectId/recommendations/:recommendationId/status` with body `{ status: 'ACCEPTED' }`. Returns the updated recommendation. This endpoint design generalizes for US-049/050.
- **Authorization.** Reuse existing `verifyProjectAccess` pattern — any org member can accept.
- **Valid transitions.** ACCEPTED can only be set from PUBLISHED status (not from REJECTED, DEFERRED, or already ACCEPTED). Attempting from an invalid status returns 400.

## Current codebase state (verified 2026-11-18)

- **DB:** `Recommendation` model has `status String @default("PUBLISHED")`. No status history model exists. Index on `(projectId, status)`.
- **API:** `RecommendationsController` at `apps/api/src/recommendations/recommendations.controller.ts` — `GET /` (list with optional status filter) and `GET /:recommendationId` (detail). `RecommendationsService` has `verifyProjectAccess`, `findByProject`, `findOne`, `findByAnalysisRun`.
- **Web:** Recommendation detail page at `apps/web/src/app/organizations/[id]/projects/[projectId]/recommendations/[recommendationId]/page.tsx`. Shows status badge, evidence, priority score. No action buttons.
- **Tests:** `apps/api/src/recommendations/__tests__/recommendations.service.spec.ts` exists.

## Dependencies

- Upstream: US-047 (done) — status filtering and detail page exist.
- Downstream: US-049, US-050 (reject/defer will reuse status history model and endpoint pattern).

## Implementation subtasks

### 1. Database — Add RecommendationStatusHistory model

- [x] Add `RecommendationStatusHistory` model to `packages/database/prisma/schema.prisma`:
  - `id String @id @default(uuid())`
  - `recommendationId String`
  - `fromStatus String`
  - `toStatus String`
  - `changedBy String`
  - `reason String?`
  - `createdAt DateTime @default(now()) @db.Timestamptz(6)`
  - Relation to `Recommendation` with `onDelete: Cascade`
  - Index on `(recommendationId, createdAt)`
- [x] Add `statusHistory RecommendationStatusHistory[]` relation to `Recommendation` model.
- [x] Run `pnpm --filter @userpulse/database migrate:dev` or create migration manually.

### 2. API — Add updateStatus method to RecommendationsService

- [x] Add `updateStatus(orgId, projectId, recommendationId, userId, newStatus, reason?)` method:
  - Call `verifyProjectAccess`.
  - Find the recommendation (404 if not found).
  - If already at target status, return the recommendation (idempotent, no duplicate history).
  - Validate transition (PUBLISHED → ACCEPTED allowed; others return 400).
  - Use `prisma.$transaction` to update `recommendation.status` and create `RecommendationStatusHistory` entry.
  - Return the updated recommendation.

### 3. API — Add PATCH endpoint to controller

- [x] Add `PATCH :recommendationId/status` to `RecommendationsController`.
- [x] Accept body `{ status: string; reason?: string }` via Zod schema.
- [x] For US-048, only `ACCEPTED` status is used; the endpoint generalizes for US-049/050.

### 4. API — Unit tests

- [x] Test `updateStatus` happy path: PUBLISHED → ACCEPTED, history created.
- [x] Test idempotency: already ACCEPTED returns success, no duplicate history.
- [x] Test invalid transition: REJECTED → ACCEPTED returns 400.
- [x] Test not found: returns 404.
- [x] Test non-member: returns 404.

### 5. Web — Add Accept button to detail page

- [x] Add an "Accept" button to the recommendation detail page, visible when `status === 'PUBLISHED'`.
- [x] On click, `PATCH` to the status endpoint with `{ status: 'ACCEPTED' }`.
- [x] On success, update the local state to reflect the new status.
- [x] Show loading state during the request.
- [x] Handle errors (show error message).

### 6. Verification

- [x] `pnpm --filter api test` — 301 passed (5 new updateStatus tests).
- [x] `pnpm lint` — pass (pre-existing warnings only).
- [x] `pnpm typecheck` — pass.
- [x] `pnpm build` — pass.
- [x] `pnpm format:check` — pass.

## Definition of Done

- [x] An authorized user can accept a recommendation via the API.
- [x] The status change is persisted in the database.
- [x] A history entry records the user, timestamp, and transition.
- [x] List and detail views show the updated status.
- [x] Repeated accept requests are idempotent (no duplicate history).
- [x] Tests pass and code follows project conventions.
