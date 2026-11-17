# US-044 — View confidence and impact

- **Epic:** EP-09 AI Recommendations
- **Priority:** P0 (M7 — AI Recommendation Engine)
- **Source:** `harness/user-stories.md`
- **Status:** Done
- **Created:** 2026-11-17
- **Completed:** 2026-11-17

## Story

> **As a** product manager, **I want** to understand recommendation confidence and potential impact, **so that** I can prioritize suggestions.

## Acceptance criteria

- [x] Each published recommendation has confidence and impact assessments.
- [x] Assessment definitions are documented.
- [x] Priority uses the agreed scoring method.
- [x] The score is described as a relative ranking aid, not a guarantee.
- [x] Weak or missing evidence lowers confidence or prevents publication.

## Story review

**Scope boundary:** This story adds confidence, impact, and priority scoring to the recommendation generation and display pipeline. It does not change evidence gathering (US-042), review workflows (US-047–050), or duplicate detection (US-045).

**Key decisions:**

- **Scoring model.** The architecture document specifies `Priority Score = Reach × Impact × Confidence`, each normalized to 0–1. CLAUDE.md reiterates this. Component values must be retained alongside the composite score.
- **Confidence computation.** Confidence derives from evidence strength:
  - `feature_adoption` evidence: based on sample size (featureUsers / totalUsers ratio and absolute count). High confidence when sample is large and adoption rate is clearly low/high.
  - `activity_change` evidence: based on absolute difference (currentCount vs baselineCount) and percentage change magnitude. Higher confidence for larger absolute changes.
  - `feature_usage` evidence: based on total events count. Higher confidence with more data.
  - Weak/missing evidence (null evidence, empty evidence, very small sample sizes) → low confidence (< 0.3). If confidence is below a minimum threshold (0.2), the recommendation is not published.
- **Impact computation.** Impact derives from the magnitude of the issue:
  - Low adoption with many active users → high impact (many users affected).
  - Large activity changes → high impact.
  - Feature usage anomalies → moderate impact.
  - Impact is relative to the project's overall activity.
- **Reach computation.** Reach derives from how many users are affected:
  - For feature-specific recommendations: `featureUsers / totalUsers` or `activeUsers` ratio.
  - For project-wide recommendations: normalized based on `activeUsers`.
- **Database changes.** Add `confidence`, `impact`, `reach`, and `priorityScore` fields to the `Recommendation` model. All are `Float` type, range 0–1 (except `priorityScore` which is 0–1 as well since it's a product of 0–1 values).
- **Backward compatibility.** Existing recommendations without scores will display as "Score unavailable" in the UI. New recommendations will always have scores.
- **UI display.** Each recommendation card shows confidence, impact, and priority score with visual indicators and explanatory tooltips. Recommendations list sorted by priority score (highest first). A disclaimer notes the score is a relative ranking aid.

## Current codebase state (verified 2026-11-17)

- `packages/database/prisma/schema.prisma` — `Recommendation` model has `evidence Json`, but NO confidence, impact, reach, or priorityScore fields.
- `apps/api/src/recommendations/recommendation-generator.service.ts` — `GeneratedRecommendation` interface has no confidence/impact fields. `generateRecommendations()` creates recommendations but does not compute scores. `validateRecommendation()` checks title/summary/action/category/evidence but not confidence.
- `apps/api/src/recommendations/recommendations.service.ts` — `RecommendationInfo` interface has no score fields. `findByProject()` orders by `createdAt desc`, not by priority.
- `apps/api/src/recommendations/recommendations.controller.ts` — Returns full recommendation objects, no filtering or transformation.
- `apps/api/src/analysis-runs/analysis-run-processor.service.ts` — Creates recommendations with `createMany()`, mapping `GeneratedRecommendation` fields. Does not include any score fields.
- `apps/web/.../[projectId]/page.tsx` — `RecommendationData` type has no score fields. `RecommendationsSection` displays recommendations ordered by API response order, with category badges but no score display.
- `apps/api/src/recommendations/evidence-gatherer.service.ts` — `EvidencePackage` provides `activeUsers`, `totalEvents`, `featureAdoption` (with `adoptionRate`, `featureUsers`, `totalUsers`), `activityChanges` (with `percentChange`, `currentCount`, `baselineCount`, `significant`), `featureUsage` (with `totalEvents`, `classification`).

## Dependencies

- Upstream: US-042 (done) — recommendations with evidence. US-043 (done) — evidence display.
- Downstream: US-045 (duplicate detection), US-047 (view recommendations list — will benefit from sorting by priority).

## Implementation subtasks

### 1. Database — Add score fields to Recommendation model

- [x] Add to `Recommendation` model in `packages/database/prisma/schema.prisma`:
  - `confidence Float?` — 0 to 1
  - `impact Float?` — 0 to 1
  - `reach Float?` — 0 to 1
  - `priorityScore Float?` — 0 to 1 (product of reach × impact × confidence)
- [x] Create migration: `npx prisma migrate dev --name add_recommendation_scores`
- [x] Add index `@@index([projectId, priorityScore])` for sorted queries.

### 2. API — Add scoring logic to RecommendationGeneratorService

- [x] Add `confidence`, `impact`, `reach`, `priorityScore` fields to `GeneratedRecommendation` interface in `apps/api/src/recommendations/recommendation-generator.service.ts`.
- [ ] Add private method `computeScores(rec: GeneratedRecommendation, evidence: EvidencePackage): { confidence: number; impact: number; reach: number; priorityScore: number }`:
  - **Confidence** (0–1): Based on evidence type and strength:
    - `feature_adoption`: `Math.min(1, featureUsers / 20) * 0.5 + (totalUsers >= 10 ? 0.5 : totalUsers / 20)`. Clamp to [0, 1].
    - `activity_change`: `Math.min(1, Math.abs(currentCount - baselineCount) / 100) * 0.6 + (Math.abs(percentChange) >= 50 ? 0.4 : Math.abs(percentChange) / 125)`. Clamp to [0, 1].
    - `feature_usage`: `Math.min(1, totalEvents / 100)`. Clamp to [0, 1].
    - Generic/no evidence type: `0.3`.
    - Final: round to 2 decimal places.
  - **Impact** (0–1): Based on severity/magnitude:
    - `feature_adoption` with low adoption: `1 - adoptionRate / 100` (lower adoption = higher impact).
    - `activity_change` decrease: `Math.min(1, Math.abs(percentChange) / 100)`. Increase: `Math.min(1, percentChange / 200)` (increases are less urgent).
    - `feature_usage` high: `0.4` (informational). Low: `0.7`.
    - Generic: `0.5`.
    - Final: round to 2 decimal places.
  - **Reach** (0–1): Based on affected user count:
    - Feature-specific: `Math.min(1, (evidence.featureUsers || evidence.activeUsers) / Math.max(evidence.activeUsers, 1))`.
    - Project-wide: `Math.min(1, activeUsers / Math.max(activeUsers, 1))` = 1.0.
    - Use the evidence's `featureUsers` / `totalUsers` / `activeUsers` as appropriate.
    - Final: round to 2 decimal places.
  - **Priority Score**: `reach * impact * confidence`, rounded to 4 decimal places.
- [x] Call `computeScores()` for each recommendation in `generateRuleBasedRecommendations()` after creation.
- [x] Update `validateRecommendation()`: if `confidence < 0.2`, log a warning and reject the recommendation (weak evidence prevents publication).

### 3. API — Update AnalysisRunProcessorService

- [x] Update `apps/api/src/analysis-runs/analysis-run-processor.service.ts`: when creating recommendations via `createMany()`, include `confidence`, `impact`, `reach`, `priorityScore` from `GeneratedRecommendation`.

### 4. API — Update RecommendationsService query ordering

- [x] Update `findByProject()` in `apps/api/src/recommendations/recommendations.service.ts`: change `orderBy` from `{ createdAt: 'desc' }` to `[{ priorityScore: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]` to sort by priority score (highest first), falling back to newest for ties or null scores.

### 5. API — Update RecommendationInfo type

- [x] Add `confidence`, `impact`, `reach`, `priorityScore` (all `number | null`) to `RecommendationInfo` interface in `apps/api/src/recommendations/recommendations.service.ts`.

### 6. Web — Update RecommendationData type

- [x] Add `confidence`, `impact`, `reach`, `priorityScore` (all `number | null`) to `RecommendationData` type in `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`.

### 7. Web — Add PriorityScoreDisplay component

- [x] Create inline component in the project page file:
  - Shows a priority score bar or badge (e.g., "Priority: 0.42").
  - Shows confidence/impact/reach as sub-labels or expandable details.
  - Color coding: high (>0.6) green, medium (0.3–0.6) amber, low (<0.3) gray.
  - Tooltip or expandable section explaining: "Priority Score = Reach × Impact × Confidence. This is a relative ranking aid, not a guarantee of outcomes."
  - Definition toggles for each component (Reach, Impact, Confidence).
  - If scores are null (legacy recommendations), show "Score unavailable".

### 8. Web — Update RecommendationsSection

- [x] Add `PriorityScoreDisplay` to each recommendation card, between the category badge and the title.
- [x] Add a disclaimer text at the top of the recommendations section: "Recommendations are ranked by a relative priority score (Reach × Impact × Confidence). Scores are ranking aids, not guarantees."

### 9. Tests

- [x] Unit tests for `computeScores()` in `apps/api/src/recommendations/__tests__/recommendation-generator.service.spec.ts`:
  - Test confidence computation for each evidence type (feature_adoption, activity_change, feature_usage, generic).
  - Test impact computation for each evidence type.
  - Test reach computation for feature-specific and project-wide.
  - Test priority score = reach × impact × confidence.
  - Test low confidence (< 0.2) prevents publication.
  - Test weak/missing evidence produces low confidence.
- [x] Update existing recommendation generator tests to include score fields in assertions.
- [x] Build/lint/typecheck pass.

## Verification

- [x] `pnpm --filter api test` — 278 passed (7 new scoring tests)
- [x] `pnpm lint` — pass (pre-existing warnings only)
- [x] `pnpm typecheck` — pass
- [x] `pnpm build` — pass
- [x] `pnpm format:check` — pass

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

- **Score formula.** Using the architecture's prescribed Reach × Impact × Confidence model with each component normalized to 0–1.
- **Minimum confidence threshold.** 0.2 chosen as the cutoff below which recommendations are not published. This is conservative — it filters out only the weakest evidence.
- **No AI-based scoring.** Scores are deterministic, computed from evidence metrics. No Bedrock calls needed.
- **Existing recommendations.** Score fields are nullable so existing recommendations don't break. They'll show "Score unavailable" in the UI.
