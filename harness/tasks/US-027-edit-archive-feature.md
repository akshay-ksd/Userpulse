# US-027 — Edit or archive a feature

- **Epic:** EP-06 Feature Management
- **Priority:** P0 (M4 — Feature Management and Analytics Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** product manager, **I want** to edit or archive a feature, **so that** feature definitions stay aligned with my product.

## Acceptance criteria

- [x] Authorized users can edit feature details. — `PATCH /organizations/:orgId/projects/:projectId/features/:featureId` supports name, description, and status updates; membership verified.
- [x] Archiving requires confirmation. — Browser `confirm()` dialog before archive action.
- [x] Archived features are clearly identified. — Status badge shows ARCHIVED in neutral gray vs ACTIVE in green.
- [x] Historical events remain available according to retention policy. — No data is deleted on archive; retention policy (US-053) will apply separately.

## Story review

**Scope boundary:** This story adds update (edit + archive/restore) capability to the existing `Feature` model and `FeaturesModule` from US-026. The pattern mirrors US-011 (Update or archive a project) exactly.

**Key decisions:**

- **API endpoint:** `PATCH /organizations/:orgId/projects/:projectId/features/:featureId` — supports partial updates of `name`, `description` (nullable), and `status` (ACTIVE/ARCHIVED).
- **Authorization:** Same org membership check as existing feature endpoints. Any org member can edit features (matching create/view permissions from US-026).
- **Validation:** Name: optional, trimmed, 1–100 chars, min 1 if provided. Description: optional, nullable (null clears it), trimmed, max 500 chars. Status: optional, must be `ACTIVE` or `ARCHIVED`.
- **Feature lookup:** Must verify feature belongs to the given project and org. Return 404 for non-existent or cross-tenant access.
- **Archive confirmation:** Client-side `confirm()` dialog before sending the archive request (same as US-011 project archive).
- **Status display:** ACTIVE features get green badge, ARCHIVED get neutral gray badge — same pattern as project status badges.
- **Historical events:** No data is deleted on archive. The `Feature` row remains with `status: ARCHIVED`. Retention policy (US-053) will apply separately. Event-to-feature mappings (US-028) will still reference archived features.
- **Web UI:** Add edit inline form and archive/restore toggle button to each feature in the `FeaturesSection` component on the project detail page.

**Out of scope:**
- Event-to-feature mapping (US-028)
- Unmapped events (US-029)
- Data retention/deletion (US-053)

## Current codebase state (verified 2026-11-15)

- `packages/database/prisma/schema.prisma` — `Feature` model exists with `FeatureStatus` enum (ACTIVE/ARCHIVED), `id`, `projectId`, `name`, `description`, `status`, `createdAt`, `updatedAt`. No schema changes needed.
- `apps/api/src/features/features.controller.ts` — Has `POST` (create) and `GET` (list) endpoints. Needs `PATCH :featureId`.
- `apps/api/src/features/features.service.ts` — Has `create()`, `findByProject()`, and `verifyProjectAccess()`. Needs `update()`.
- `apps/api/src/features/create-feature.dto.ts` — Create DTO with Zod. Need a new `update-feature.dto.ts`.
- `apps/api/src/features/features.module.ts` — Module registered in AppModule.
- `apps/api/src/features/features.service.spec.ts` — Existing unit tests for create and findByProject.
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — `FeaturesSection` component shows feature list with name, description, created date. No edit/archive UI yet.
- **Reference pattern:** `apps/api/src/projects/update-project.dto.ts` — update DTO for projects with optional name, description (nullable), status.

## Dependencies

**Upstream (must be Done):**
- US-026 — Create a product feature (Done) — Feature model, FeaturesModule, FeaturesSection UI

**Downstream (depends on this):**
- US-028 — Map events to a feature (archived features should still be visible but clearly marked)

## Implementation subtasks

### 1. API — Update feature DTO

- [x] **1.1** Create `apps/api/src/features/update-feature.dto.ts`:
  ```typescript
  import { z } from 'zod';

  export const updateFeatureSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  });

  export type UpdateFeatureDto = z.infer<typeof updateFeatureSchema>;
  ```

### 2. API — FeaturesService.update()

- [x] **2.1** Add `update()` method to `apps/api/src/features/features.service.ts`:
  - Verify org membership and project existence via `verifyProjectAccess()`.
  - Find feature by `id` where `projectId` matches. Return 404 if not found.
  - Update with provided fields only. Use Prisma `update()`.
  - Return the updated `FeatureInfo`.

### 3. API — FeaturesController PATCH endpoint

- [x] **3.1** Add `PATCH :featureId` to `apps/api/src/features/features.controller.ts`:
  - `@Patch(':featureId')` with `@Body({ schema: updateFeatureSchema })`.
  - Import `Patch` from `@nestjs/common`.
  - Delegate to `featuresService.update()`.
  - Return the updated feature (200).

### 4. API — Unit tests

- [x] **4.1** Add unit tests to `apps/api/src/features/features.service.spec.ts`:
  - Update name — happy path.
  - Update description — happy path.
  - Update status to ARCHIVED — happy path.
  - Restore status to ACTIVE — happy path.
  - Clear description (null) — happy path.
  - Update non-member — throws NotFoundException.
  - Update non-existent feature — throws NotFoundException.
  - Update feature in wrong project — throws NotFoundException.

### 5. API — E2E tests

- [x] **5.1** Add e2e tests in `apps/api/test/features.e2e-spec.ts` (or create new):
  - `PATCH` 200 — update name.
  - `PATCH` 200 — archive feature (status ARCHIVED).
  - `PATCH` 200 — restore feature (status ACTIVE).
  - `PATCH` 200 — clear description.
  - `PATCH` 200 — archived feature visible in list with status.
  - `PATCH` 401 — unauthenticated.
  - `PATCH` 404 — non-member.
  - `PATCH` 404 — non-existent feature.
  - `PATCH` 400 — empty name.

### 6. Web — Edit and archive UI in FeaturesSection

- [x] **6.1** Update `FeaturesSection` in `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add status badge to each feature (green for ACTIVE, gray for ARCHIVED — same as project status).
  - Add "Edit" button to each feature that toggles an inline edit form (name + description fields).
  - Add "Archive" / "Restore" button to each feature:
    - Archive: `confirm()` dialog, then `PATCH` with `{ status: 'ARCHIVED' }`.
    - Restore: `PATCH` with `{ status: 'ACTIVE' }` (no confirmation needed).
  - Edit form: pre-fills name and description. Submits via `PATCH`. On success, updates local state. On cancel, hides form.
  - Handle loading, error states for edit/archive operations.

## Verification

Run all of the following:

1. `pnpm --filter api test` — unit tests pass (including new feature update tests).
2. `pnpm --filter api test:e2e` — e2e tests pass (if PostgreSQL available).
3. `pnpm lint` — pass.
4. `pnpm typecheck` — pass.
5. `pnpm build` — pass.
6. `pnpm format:check` — pass.

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

- No database migration needed — `FeatureStatus` enum and `updatedAt` field already exist from US-026.
- Any org member can edit/archive features (same as create/view permissions). If only owners should edit, this needs clarification.
- The feature list endpoint already returns all features (no status filter). Archived features remain visible in the list, clearly marked with status badge.
- Historical event data is not affected by archiving — no data deletion occurs.
