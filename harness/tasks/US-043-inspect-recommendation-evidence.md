# US-043 — Inspect recommendation evidence

- **Epic:** EP-09 AI Recommendations
- **Priority:** P0 (M7 — AI Recommendation Engine)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-17)
- **Created:** 2026-11-17

## Story

> **As a** product manager, **I want** to inspect the evidence behind a recommendation, **so that** I can decide whether it is relevant.

## Acceptance criteria

- [x] Recommendation details show supporting metrics.
- [x] Evidence period and metric definitions are available.
- [x] Observed facts are distinguished from AI interpretation.
- [x] Evidence belongs to the correct project and analysis run.
- [x] Missing evidence is clearly identified.

## Story review

**Scope boundary:** This story covers displaying recommendation evidence in the UI and ensuring the API returns sufficient detail. It does not add new evidence types, change how evidence is generated (US-042), or add review actions (US-047–050).

**Key decisions:**
- **Evidence structure already exists.** The `Recommendation` model stores `evidence` as a JSON column. The `RecommendationGeneratorService` already builds typed evidence objects with `type` discriminators (`feature_adoption`, `activity_change`, `feature_usage`) and metric fields. The API's `findOne` endpoint already returns the full recommendation including `evidence`. No schema changes needed.
- **Observed vs interpretation.** Evidence JSON contains measured facts (counts, rates, percentages). The recommendation's `summary` and `suggestedAction` contain AI-generated interpretation. The UI will visually separate these: a "Supporting evidence" section for metrics and an "AI interpretation" section for the suggestion.
- **Evidence type rendering.** Each evidence `type` gets a specific display showing its relevant metrics. Unknown types get a generic key-value fallback.
- **Missing evidence.** If `evidence` is null, empty, or has an unrecognized shape, the UI shows a clear "No evidence available" message.
- **Analysis run linkage.** Each recommendation already stores `analysisRunId`. The detail view shows this reference and the evidence period (`periodStart`/`periodEnd`).
- **Metric definitions.** A definitions block explains each metric shown (e.g., "Adoption rate: percentage of active users who triggered this feature's events").
- **No new API endpoints needed.** The existing `GET /organizations/:orgId/projects/:projectId/recommendations/:recommendationId` returns all needed data including the `evidence` JSON.

## Current codebase state (verified 2026-11-17)

- `packages/database/prisma/schema.prisma` — `Recommendation` model has `evidence Json` field, `analysisRunId`, `periodStart`, `periodEnd`, `projectId`, `organizationId`.
- `apps/api/src/recommendations/recommendations.service.ts` — `findOne()` returns full recommendation including `evidence` field.
- `apps/api/src/recommendations/recommendations.controller.ts` — `GET :recommendationId` endpoint exists, returns full recommendation.
- `apps/api/src/recommendations/recommendation-generator.service.ts` — Generates evidence objects with types: `feature_adoption` (adoptionRate, featureUsers, totalUsers, activeUsers, period), `activity_change` (eventName, currentCount, baselineCount, direction, percentChange, period), `feature_usage` (featureId, featureName, totalEvents, classification, period). Also generates a generic overall evidence object.
- `apps/web/.../[projectId]/page.tsx` — `RecommendationsSection` lists recommendations with expand/collapse. Expanded view shows `suggestedAction` and evidence period but NOT the evidence metrics. The `RecommendationData` type does NOT include `evidence` or `analysisRunId`.

## Dependencies

- Upstream: US-042 (done) — recommendations with evidence exist.
- Downstream: US-047 (view recommendations list), US-044 (confidence/impact).

## Implementation subtasks

### 1. Web — Update RecommendationData type and fetch

- [x] Add `evidence`, `analysisRunId`, and `affectedFeatureId` to `RecommendationData` type in the project detail page.

### 2. Web — Evidence display components

- [x] Create an `EvidenceDisplay` component that accepts `evidence: unknown` and renders based on `evidence.type`:
  - `feature_adoption`: Show adoption rate, feature users vs total users, active users, period.
  - `activity_change`: Show event name, current vs baseline count, direction, percent change, period.
  - `feature_usage`: Show feature name, total events, classification (high/low/normal), period.
  - Generic/unknown: Show key-value pairs from the evidence object.
  - Null/empty: Show "No supporting evidence available for this recommendation."
- [x] Add metric definitions via a toggleable "What do these metrics mean?" section.
- [x] Visually distinguish observed facts (evidence metrics in a "Supporting evidence" card) from AI interpretation (summary and suggested action in an "AI interpretation" card).

### 3. Web — Update RecommendationsSection expanded view

- [x] Replace the current expanded view with the new evidence display.
- [x] Show analysis run ID reference and evidence period clearly.
- [x] Show the project and analysis run association.

### 4. API — Update RecommendationData type (if needed)

- [x] Verify the `findOne` and `findByProject` endpoints return `evidence` and `analysisRunId`. The service already returns all fields from the model, so no API changes should be needed.

### 5. Tests

- [x] API unit tests: Verify `findOne` returns evidence field (should already pass).
- [x] Build/lint/typecheck pass.

## Verification

```bash
pnpm --filter api test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
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

- Evidence structure is well-defined from US-042's `RecommendationGeneratorService`. No new evidence types needed.
- No new API endpoints — existing `findOne` returns all needed data.
- This is purely a frontend display story with minor type additions.
