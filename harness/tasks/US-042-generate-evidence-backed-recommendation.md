# US-042 — Generate an evidence-backed recommendation

- **Epic:** EP-09 AI Recommendations
- **Priority:** P0 (M7 — AI Recommendation Engine)
- **Source:** `harness/user-stories.md`
- **Status:** Done
- **Created:** 2026-11-17

## Story

> **As a** product manager, **I want** the platform to suggest improvements based on usage evidence, **so that** I can discover opportunities.

## Acceptance criteria

- [x] Recommendations use authorized project context and validated evidence.
- [x] Each recommendation includes a title, summary, and suggested action.
- [x] Affected feature or product area is identified when possible.
- [x] Supporting metrics and time period are included.
- [x] Unsupported numerical claims are not published.
- [x] Recommendations are saved only after validation.

## Implementation subtasks

### 1. Database — Add Recommendation model
- [x] Recommendation model in Prisma schema with relations and indexes
- [x] Migration SQL created
- [x] Prisma client regenerated

### 2. API — Create RecommendationsModule with service and controller
- [x] RecommendationsModule, RecommendationsService, RecommendationsController
- [x] Registered in app.module.ts

### 3. API — Create EvidenceGathererService
- [x] Evidence gathering with feature adoption, activity changes, usage insights, top events, active users

### 4. API — Create RecommendationGeneratorService
- [x] Rule-based recommendation generation from evidence (Bedrock deferred — no credentials)
- [x] Validation of required fields, categories, and evidence on every recommendation

### 5. API — Extend AnalysisRunProcessor
- [x] Gather evidence and generate recommendations after sufficient data check
- [x] Persist recommendations atomically with run status update
- [x] Graceful fallback if recommendation generation fails

### 6. API — Add recommendations to analysis run detail
- [x] GET /organizations/:orgId/projects/:projectId/analysis-runs/:runId/recommendations endpoint

### 7. Web — Display recommendations on project workspace
- [x] RecommendationsSection component with category badges, expandable cards, evidence period

### 8. Tests — Unit tests
- [x] recommendations.service.spec.ts (9 tests)
- [x] evidence-gatherer.service.spec.ts (3 tests)
- [x] recommendation-generator.service.spec.ts (7 tests)
- [x] Updated analysis-run-processor.service.spec.ts for new dependencies

### 9. Tests — E2E tests
- [ ] Skipped — no PostgreSQL available in cloud environment (consistent with US-013, US-021–023)

## Verification

| Check | Result |
|-------|--------|
| `pnpm --filter api test` | 271 tests pass (23 files) |
| `pnpm lint` | Pass (only pre-existing warnings) |
| `pnpm typecheck` | Pass |
| `pnpm build` | Pass |
| `pnpm format:check` | Pass |

## Definition of Done

- [x] Recommendation model exists in Prisma with correct relations and indexes.
- [x] Evidence gathering collects feature adoption, activity changes, usage insights.
- [x] Rule-based generator produces validated recommendations from evidence.
- [x] Numerical claims are validated against source evidence.
- [x] Recommendations are persisted only after validation.
- [x] Analysis run processor generates recommendations on completion.
- [x] API endpoints serve recommendations by project and by analysis run.
- [x] Web UI displays recommendations with title, summary, action, category, and evidence period.
- [x] Unit tests cover services and validation.
- [x] Lint, typecheck, and build pass.
- [x] progress.md updated.
