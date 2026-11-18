# US-026 — Create a product feature

- **Epic:** EP-06 Feature Management
- **Priority:** P0 (M4 — Feature Management and Analytics Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** product manager, **I want** to define a product feature, **so that** I can analyze usage at a meaningful product level.

## Acceptance criteria

- [x] An authorized user can create a feature with a name and description.
- [x] The feature belongs to the selected project.
- [x] Empty names are rejected.
- [x] The feature appears in the feature list.

## Story review

**Scope boundary:** This story introduces the `Feature` model and a new `FeaturesModule` in the API, plus a features section on the project detail page. Features are scoped to a project (which is scoped to an organization). Any org member can create/view features.

**Key decisions:**

- **Data model:** New `Feature` model in Prisma with `id`, `name`, `description`, `status` (ACTIVE/ARCHIVED for US-027), `projectId`, `createdAt`, `updatedAt`. The architecture specifies `Feature` and `FeatureEventMapping` in PostgreSQL; this story creates only `Feature`. `FeatureEventMapping` is US-028.
- **API endpoints:**
  - `POST /organizations/:orgId/projects/:projectId/features` (201) — create a feature
  - `GET /organizations/:orgId/projects/:projectId/features` — list features for a project
- **Authorization:** Reuse the org membership check pattern from `ProjectsService.verifyMembership()`. Any org member can create and view features. Project must exist and belong to the org.
- **Validation:** Name: required, trimmed, 1–100 chars. Description: optional, trimmed, max 500 chars. Same pattern as `create-project.dto.ts`.
- **Feature status:** Default `ACTIVE`. Archiving is US-027 scope, but the model includes the field to avoid a migration later.
- **Web UI:** Add a `FeaturesSection` component on the project detail page (same pattern as `TrackingCredentials`): create form, feature list, empty state.

**Out of scope:**
- Edit/archive features (US-027)
- Event-to-feature mapping (US-028)
- Unmapped events (US-029)

## Current codebase state (verified 2026-11-15)

- `packages/database/prisma/schema.prisma` — No `Feature` model exists yet. Architecture specifies it should be here.
- `apps/api/src/projects/` — `ProjectsModule` with `ProjectsService` (has `verifyMembership()`), `ProjectsController`. Pattern to follow.
- `apps/api/src/api-keys/` — Similar nested resource pattern (`/organizations/:orgId/projects/:projectId/api-keys`).
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — Project detail page with `TrackingCredentials` and `EventCollectionStatus` components.
- `apps/api/src/app.module.ts` — Module registration list.

## Dependencies

**Upstream (must be Done):**
- US-009 — Create a project (Done) — project model and API
- US-010 — View projects (Done) — project detail page

**Downstream (depends on this):**
- US-027 — Edit or archive a feature
- US-028 — Map events to a feature
- US-029 — Find unmapped events

## Implementation subtasks

### 1. Database — Feature model

- [x] **1.1** Add `Feature` model to `packages/database/prisma/schema.prisma`:
  ```prisma
  enum FeatureStatus {
    ACTIVE
    ARCHIVED
  }

  model Feature {
    id          String        @id @default(uuid())
    projectId   String
    name        String
    description String?
    status      FeatureStatus @default(ACTIVE)
    createdAt   DateTime      @default(now())
    updatedAt   DateTime      @updatedAt

    project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

    @@index([projectId])
    @@map("features")
  }
  ```
- [x] **1.2** Add `features Feature[]` relation to the `Project` model.
- [x] **1.3** Run `npx prisma migrate dev --name add_features_table` from `packages/database/`.

### 2. API — Features module

- [x] **2.1** Create `apps/api/src/features/create-feature.dto.ts`:
  - Zod schema: `name` (string, trim, min 1, max 100), `description` (string, trim, max 500, optional).

- [x] **2.2** Create `apps/api/src/features/features.service.ts`:
  - `FeaturesService` with `PrismaService` injection.
  - Private `verifyProjectAccess(orgId, projectId, userId)` — verify org membership + project exists in org (same pattern as projects).
  - `create(orgId, projectId, userId, dto)` → returns `FeatureInfo`.
  - `findByProject(orgId, projectId, userId)` → returns `FeatureInfo[]` (ordered by `createdAt desc`).
  - Interface `FeatureInfo`: `{ id, projectId, name, description, status, createdAt }`.

- [x] **2.3** Create `apps/api/src/features/features.controller.ts`:
  - `@Controller('organizations/:orgId/projects/:projectId/features')`
  - `POST /` (201) — `@Body({ schema: createFeatureSchema })`, `@CurrentUser()`, `@Param('orgId')`, `@Param('projectId')`.
  - `GET /` — list features for the project.

- [x] **2.4** Create `apps/api/src/features/features.module.ts`:
  - Import `PrismaModule`, register `FeaturesService` and `FeaturesController`.

- [x] **2.5** Register `FeaturesModule` in `apps/api/src/app.module.ts`.

### 3. Web — Features section on project detail page

- [x] **3.1** Add `FeaturesSection` component to `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Fetches `GET /organizations/:orgId/projects/:projectId/features` on mount.
  - Create form: name (required) + description (optional) inputs, submit button.
  - Feature list: shows name, description, creation date.
  - Empty state: "No features yet. Create one to start organizing your product analytics."
  - Loading/error states.

- [x] **3.2** Add `FeaturesSection` to the `ProjectDetail` render, after `EventCollectionStatus`.

### 4. Tests

- [x] **4.1** Unit tests for `FeaturesService` in `apps/api/src/features/features.service.spec.ts`:
  - `create()` happy path — returns feature info
  - `create()` non-member — throws NotFoundException
  - `create()` missing project — throws NotFoundException
  - `findByProject()` happy path — returns features
  - `findByProject()` empty — returns empty array
  - `findByProject()` non-member — throws NotFoundException

- [x] **4.2** E2E tests in `apps/api/test/features.e2e-spec.ts`:
  - POST 201 — create with name and description
  - POST 201 — create with name only
  - POST 400 — empty name
  - POST 401 — unauthenticated
  - POST 404 — non-member
  - GET 200 — list features
  - GET 200 — empty list
  - GET 401 — unauthenticated
  - GET 404 — non-member

### 5. Verification

- [x] `pnpm --filter api test` — 130 passed (6 new)
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

- Feature status field included in the model now (default ACTIVE) to avoid a migration in US-027. Only ACTIVE features returned in the list for now.
- Any org member can create/view features (not restricted to OWNER). This matches the pattern for projects.
- No unique constraint on feature name within a project — duplicate names are allowed (user may want "Search v1" and "Search v2").
- Feature list returns all features regardless of status for now; US-027 will add archive/filter behavior.
