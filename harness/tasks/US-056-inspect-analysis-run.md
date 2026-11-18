# US-056 — Inspect an analysis run

- **Epic:** EP-11 Privacy, Security, Operations
- **Priority:** P1 (M9 — Security and Pilot Readiness)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-18) — see `harness/progress.md` for verification record
- **Created:** 2026-11-18

## Story

> **As an** operations engineer or authorized project administrator, **I want** to inspect an analysis run, **so that** I can understand whether recommendations were generated successfully.

## Acceptance criteria

- [x] Each run has a stable identifier.
- [x] Project scope, requested period, status, and timestamps are recorded.
- [x] Failure details are available to authorized operators.
- [x] Recommendations can be linked to the run that generated them.
- [x] Retries do not erase prior run history.

## Story review

This story is primarily about surfacing existing analysis run data in a inspectable, operator-friendly way. Most of the backend infrastructure already exists from US-041 through US-046.

**Scope boundaries:**
- **In scope:** Enrich the `findOne` API to include recommendation count and recommendation summaries. Create a dedicated analysis run detail page in the web app that shows run ID, project scope, period, status, all timestamps, failure details (statusMessage), and linked recommendations. Add tests for the enriched detail endpoint. Verify that retries create new run records (not overwrite).
- **Out of scope:** New analysis run statuses, changes to the processor, ClickHouse queries, new API endpoints beyond enhancing findOne.

**Key decisions:**
- Enrich `findOne` to include `_count.recommendations` and optionally a brief recommendation list — this gives a single-request inspection view.
- Create a dedicated `/organizations/[id]/projects/[projectId]/analysis-runs/[runId]` web page.
- The existing `GET :runId/recommendations` endpoint already allows drilling into linked recommendations.
- Retries are already safe — each `requestAnalysis` call creates a new `AnalysisRun` row; no overwriting occurs.

## Current codebase state (verified 2026-11-18)

- **Schema:** `AnalysisRun` model in `packages/database/prisma/schema.prisma` with `id`, `projectId`, `organizationId`, `requestedById`, `status`, `periodStart`, `periodEnd`, `eventCount`, `statusMessage`, `startedAt`, `completedAt`, `createdAt`, `updatedAt`. Has `recommendations` relation.
- **API:** `apps/api/src/analysis-runs/analysis-runs.service.ts` — `requestAnalysis`, `findByProject`, `findOne` methods. All verify project access via org membership. `findOne` returns a flat `AnalysisRunInfo` without recommendation count.
- **API:** `apps/api/src/analysis-runs/analysis-runs.controller.ts` — `POST`, `GET` (list), `GET :runId`, `GET :runId/recommendations` endpoints.
- **API:** `apps/api/src/analysis-runs/analysis-run-processor.service.ts` — Background processor that claims QUEUED runs and processes them to COMPLETED/FAILED/INSUFFICIENT_DATA.
- **API tests:** `analysis-runs.service.spec.ts` — 8 tests covering requestAnalysis, findByProject, findOne.
- **Web:** Analysis runs are listed and triggered from the project detail page (`apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`). No dedicated detail page exists.
- **Web:** Recommendations UI on the project page already shows `analysisRunId` as a truncated reference.

## Dependencies

- **Upstream:** US-041 (Request product analysis), US-042 (Generate recommendation), US-047–US-050 (Recommendation review) — all Done.
- **Downstream:** None — this is the last story.

## Implementation subtasks

### 1. Enrich `findOne` in `AnalysisRunsService` (`apps/api/src/analysis-runs/analysis-runs.service.ts`)

- [ ] Add a `AnalysisRunDetail` interface extending `AnalysisRunInfo` with `recommendationCount: number` and `recommendations: { id: string; title: string; status: string; priorityScore: number }[]`.
- [ ] Update `findOne` to include `_count: { recommendations: true }` and `recommendations: { select: { id, title, status, priorityScore }, orderBy: { priorityScore: 'desc' } }`.
- [ ] Update the controller return type for the `findOne` endpoint.

### 2. Add unit tests for enriched `findOne` (`apps/api/src/analysis-runs/analysis-runs.service.spec.ts`)

- [ ] Test that `findOne` returns `recommendationCount` and recommendation list.
- [ ] Test that failed runs expose `statusMessage` to authorized users.

### 3. Create analysis run detail page (`apps/web/src/app/organizations/[id]/projects/[projectId]/analysis-runs/[runId]/page.tsx`)

- [ ] Fetch `GET /organizations/:orgId/projects/:projectId/analysis-runs/:runId`.
- [ ] Display: run ID (full stable identifier), status with color-coded badge, project scope, requested period (periodStart–periodEnd), timestamps (createdAt, startedAt, completedAt), event count, status message / failure details.
- [ ] Show linked recommendations in a list with title, status, priority score.
- [ ] Handle loading, error, not-found, and unauthenticated states.
- [ ] Link back to the project page.

### 4. Add navigation from project page to run detail

- [ ] Make analysis run items on the project page clickable links to the new detail page.

### 5. Run tests and verification

- [ ] `pnpm --filter api test`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] `pnpm format:check`

## Verification

```
pnpm --filter api test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

## Definition of Done

- [ ] The implementation meets the requested behavior and acceptance criteria.
- [ ] The solution follows the approved architecture and existing project conventions.
- [ ] Changes are limited to the task and necessary related updates.
- [ ] Relevant tests have been added or updated.
- [ ] Relevant tests and checks have been executed, or unrun checks are explicitly disclosed.
- [ ] Authorization, tenant isolation, privacy, and security implications have been considered.
- [ ] API, event, database, and documentation contracts are updated when required.
- [ ] No unrelated changes or destructive operations have been introduced.
- [ ] The final report accurately describes changes, verification, and remaining limitations.

## Assumptions / open questions

- No database migration needed — existing schema has all required fields.
- The `findOne` enrichment is backward-compatible (additional fields only).
- Retry safety is already guaranteed by the existing design (new row per request).
