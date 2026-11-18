# US-045 — Detect duplicate recommendations

- **Epic:** EP-09 AI Recommendations
- **Priority:** P1
- **Source:** `harness/user-stories.md`
- **Status:** Done
- **Created:** 2026-11-17

## Story

> **As a** product manager, **I want** similar active recommendations to be identified, **so that** I do not review the same suggestion repeatedly.

## Acceptance criteria

- [x] New recommendations are checked against relevant existing recommendations.
- [x] Similar active recommendations are flagged or handled by documented rules.
- [x] Materially different recommendations are not silently discarded.
- [x] Duplicate handling is traceable.

## Story review

**Scope boundary:** This story adds duplicate detection to the recommendation generation pipeline. It does not change evidence gathering, scoring, review workflows, or the UI beyond adding a `supersededById` link.

**Key decisions:**

- **Similarity rule.** Two recommendations are considered duplicates if they share the same `category` AND `affectedFeatureId` (for feature-specific recommendations) or the same `category` AND `affectedArea` (for project-wide recommendations without an `affectedFeatureId`). The rule-based generator produces deterministic titles for the same input pattern, so matching on category + affected target is sufficient.
- **Handling strategy.** When a new recommendation matches an existing PUBLISHED one:
  - The old recommendation is marked as `SUPERSEDED` (new status value) with a reference to the new one.
  - The new recommendation is published normally.
  - This ensures the product manager always sees the latest analysis, while the old one is traceable.
- **Traceability.** Add `supersededById` field to the `Recommendation` model — a nullable FK to another recommendation. When a recommendation is superseded, this points to the newer one that replaced it.
- **No silent discard.** Materially different recommendations (different category or different affected target) are never discarded. Even similar ones are not discarded — the old is superseded, and the new is published.
- **Status filtering.** The existing `findByProject()` already filters by `status: 'PUBLISHED'`, so superseded recommendations are automatically hidden from the main view.

## Current codebase state (verified 2026-11-17)

- `packages/database/prisma/schema.prisma` — `Recommendation` model has `status String @default("PUBLISHED")`. No `supersededById` field. No self-relation.
- `apps/api/src/analysis-runs/analysis-run-processor.service.ts` — Creates recommendations with `createMany()` and status `PUBLISHED`. No deduplication logic.
- `apps/api/src/recommendations/recommendations.service.ts` — `findByProject()` filters `status: 'PUBLISHED'`.
- `apps/api/src/recommendations/recommendation-generator.service.ts` — Generates recommendations with `category`, `affectedFeatureId`, `affectedArea` fields.

## Dependencies

- Upstream: US-042 (done), US-044 (done).
- Downstream: US-047 (view recommendations list).

## Implementation subtasks

### 1. Database — Add supersededById to Recommendation model

- [x] Add `supersededById String?` to `Recommendation` model.
- [x] Add self-relation: `supersededBy Recommendation? @relation("RecommendationSupersedes", fields: [supersededById], references: [id], onDelete: SetNull)` and inverse `supersedes Recommendation[] @relation("RecommendationSupersedes")`.
- [x] Create migration.

### 2. API — Add deduplication logic to AnalysisRunProcessorService

- [x] After generating recommendations and before `createMany()`, query existing PUBLISHED recommendations for the same `projectId`.
- [x] For each new recommendation, check if an existing PUBLISHED recommendation matches on `category` AND (`affectedFeatureId` when non-null, else `affectedArea`).
- [x] Create new recommendations with individual `create` calls to get IDs back.
- [x] For each matched old recommendation, update it: `status: 'SUPERSEDED'`, `supersededById: <new recommendation id>`.
- [x] Log superseded count for observability.

### 3. API — Update RecommendationInfo type

- [x] Add `supersededById: string | null` to `RecommendationInfo`.

### 4. Tests

- [x] Unit tests for deduplication logic in the processor.
- [x] Test: new recommendation supersedes existing with same category + affectedFeatureId.
- [x] Test: new recommendation with different category does NOT supersede.
- [x] Test: new recommendation with same category but different affectedFeatureId does NOT supersede.
- [x] Test: superseded recommendation has correct `supersededById` and `status: 'SUPERSEDED'`.
- [x] Test: recommendations without matching existing ones are published normally.
- [x] Build/lint/typecheck pass.

## Verification

```
pnpm --filter api test          # Unit tests
pnpm lint                       # Lint check
pnpm typecheck                  # Type check
pnpm build                      # Build check
pnpm format:check               # Format check
```

## Definition of Done

- [x] The implementation meets the requested behavior and acceptance criteria.
- [x] The solution follows the approved architecture and existing project conventions.
- [x] Changes are limited to the task and necessary related updates.
- [x] Relevant tests have been added or updated.
- [x] Relevant tests and checks have been executed, or unrun checks are explicitly disclosed.
- [x] Authorization, tenant isolation, privacy, and security implications have been considered.
- [x] API, event, database, and documentation contracts are updated when required.
- [x] No unrelated changes or destructive operations have been introduced.
- [x] The final report accurately describes changes, verification, and remaining limitations.

## Assumptions / open questions

- **Similarity is structural, not semantic.** Matching on category + affected target is sufficient because the rule-based generator deterministically produces recommendations for the same patterns. Semantic similarity (NLP-based) is not needed at this stage.
- **Only PUBLISHED recommendations are checked.** SUPERSEDED and other non-published recommendations are ignored during matching.
- **No UI changes needed beyond the status.** The existing `findByProject()` already filters to PUBLISHED, so superseded recommendations are hidden. A future story could add a "superseded" view.
