# US-051 — Enforce tenant isolation

| Field | Value |
|---|---|
| **Story ID** | US-051 |
| **Epic** | EP-11 Privacy, Security, and Operations |
| **Priority** | P0 |
| **Status** | Done |
| **Created** | 2026-11-18 |
| **Completed** | 2026-11-18 |

## Story

**As a** customer, **I want** my organization and project data to be isolated, **so that** other customers cannot access it.

## Acceptance criteria

- [x] Every customer-facing data operation verifies organization and project access.
- [x] Changing identifiers cannot bypass authorization.
- [x] Analytics queries are scoped to authorized projects.
- [x] Background analysis uses the correct tenant scope.
- [x] Automated tests cover cross-tenant access attempts.
- [x] Unauthorized requests do not reveal protected data.

## Story review

Security audit of the existing codebase revealed:

**Already secure:**
- All customer-facing controllers verify org membership via `verifyMembership`, `verifyProjectAccess`, or `verifyMembershipAndProject` before any data access
- Projects are always scoped to org via `findFirst({ where: { id, organizationId } })`
- Ingestion endpoint derives project/org from API key (not from user input)
- Background jobs (ScheduledAnalysisRunner, AnalysisRunProcessor, EventProcessor) inherit tenant scope from pre-validated database records
- All unauthorized access returns 404 (not 403), preventing existence disclosure

**Gap found and fixed:**
- `GET /internal/metrics/processing` exposed system-wide aggregate event processing metrics to any authenticated user. Fixed by requiring `INTERNAL_METRICS_TOKEN` header.

## Implementation subtasks

### 1. Fix: Restrict internal metrics endpoint

- [x] Add `@Public()` and `x-internal-token` header validation to `EventProcessorController`
- [x] Reject requests without valid `INTERNAL_METRICS_TOKEN` with 403

### 2. Cross-tenant isolation test suite

- [x] ProjectsService: non-member rejected for list, detail, create
- [x] RecommendationsService: non-member rejected for list, detail, status update
- [x] FunnelsService: non-member rejected for list, create
- [x] FeaturesService: non-member rejected for list, create
- [x] ApiKeysService: non-member rejected for list, create
- [x] AnalysisRunsService: non-member rejected for list
- [x] AnalysisScheduleService: non-member rejected for read
- [x] EventProcessorController: metrics reject without/wrong/missing token; allow with correct token
- [x] Cross-org URL manipulation: userA can't access orgB project via orgA URL; userB can't access orgA project via orgB URL
- [x] 404 response (not 403) for non-members: verified for ProjectsService and RecommendationsService

## Verification

- [x] Unit tests: `pnpm --filter api test` — 331 passed (22 new tenant isolation tests)
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
