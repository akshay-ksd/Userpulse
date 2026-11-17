# US-036 — Define a funnel

- **Epic:** EP-08 Funnels and Behavioral Insights
- **Priority:** P0 (M6 — Funnels and Behavioral Insights)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-17)
- **Created:** 2026-11-17

## Story

> **As a** product analyst, **I want** to define an ordered sequence of events as a funnel, **so that** I can measure progress through a product flow.

## Acceptance criteria

- [x] A funnel has a name and ordered event steps.
- [x] Each step references an event in the selected project.
- [x] A funnel contains at least two steps.
- [x] The user can edit the funnel.
- [x] Funnel definitions are project-scoped.

## Story review

**Scope boundary:** This story adds funnel definition CRUD — creating, viewing, editing, and deleting funnels. Funnel analytics (conversion/drop-off calculations) are US-037 scope, not this story.

**Key decisions:**

- **Data model:** New `Funnel` and `FunnelStep` Prisma models in PostgreSQL. Funnels are project-scoped (like Features). Steps are ordered via a `stepOrder` integer and reference event names (strings, not event IDs), matching the `FeatureEventMapping` pattern.
- **Step event references:** Steps reference `eventName` strings, not specific event rows. This matches how `FeatureEventMapping` works. Event names should exist in the project's events, but we validate loosely — a dropdown of known event names is offered on the frontend, but free-text entry is also allowed (the user may define funnels for events not yet received).
- **Minimum steps:** Zod validation enforces `steps.length >= 2` on create and update.
- **Edit behavior:** Full replacement of steps on update (delete all existing steps, insert new ones in a transaction). This avoids complex step-level PATCH logic and matches the simplicity principle.
- **Delete:** Soft delete not needed — funnels are lightweight definitions. Hard delete with cascade on steps.
- **API pattern:** Follows `FeaturesController`/`FeaturesService` pattern with `verifyProjectAccess()` and org membership checks.

**Out of scope:**
- Funnel conversion/drop-off analytics (US-037)
- Conversion window configuration (JOUR-04, P1)
- Funnel duplication/cloning
- Funnel ordering or categorization

## Current codebase state (verified 2026-11-17)

- **Prisma schema** (`packages/database/prisma/schema.prisma`): No `Funnel` or `FunnelStep` models. `Project` has relations to `Feature`, `FeatureEventMapping`, `ProjectApiKey`. `Event` model has `eventName`, `projectId`, `organizationId`.
- **API modules** (`apps/api/src/`): `FeaturesModule` is the closest pattern — CRUD with `verifyProjectAccess()`, Zod DTOs, `@CurrentUser()`. Controller at `organizations/:orgId/projects/:projectId/features`. `AnalyticsModule` handles read-only queries.
- **Web** (`apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`): Large single-file component (~2350 lines) with inline section components. `FeaturesSection` is the closest UI pattern — list with create/edit forms.
- **No funnel code exists anywhere** — this is greenfield for EP-08.

## Dependencies

- **Upstream:** US-009 (Done — projects), US-021 (Done — event ingestion), US-026 (Done — features, pattern reference). All satisfied.
- **Downstream:** US-037 (funnel conversion/drop-off) depends on funnel definitions from this story. US-038–040 (behavioral insights) are independent.

## Implementation subtasks

### 1. Database — Add Funnel and FunnelStep models

- [x] In `packages/database/prisma/schema.prisma`:
  - Add `Funnel` model: `id` (uuid PK), `projectId` (FK to Project), `name` (String), `createdAt` (DateTime), `updatedAt` (DateTime). Index on `projectId`. Map to `funnels`.
  - Add `FunnelStep` model: `id` (uuid PK), `funnelId` (FK to Funnel, cascade delete), `stepOrder` (Int), `eventName` (String), `createdAt` (DateTime). Unique constraint on `(funnelId, stepOrder)`. Index on `funnelId`. Map to `funnel_steps`.
  - Add `funnels Funnel[]` relation to `Project` model.
  - Add `steps FunnelStep[]` relation to `Funnel` model.
- [x] Run `npx prisma migrate dev --name add_funnels` from `packages/database/`.
- [x] Run `pnpm --filter @userpulse/database build` to regenerate the Prisma client.

### 2. API — Create FunnelsModule with DTOs

- [x] Create `apps/api/src/funnels/funnels.module.ts`:
  - Import `PrismaModule`. Export `FunnelsService`. Declare `FunnelsController`.
- [x] Create `apps/api/src/funnels/create-funnel.dto.ts`:
  - Zod schema: `name` (string, 1–200 chars, trimmed), `steps` (array of `{ eventName: string }`, min length 2, max length 20). Each step's `eventName` trimmed, 1–500 chars.
  - Export `createFunnelSchema` and `CreateFunnelDto` type.
- [x] Create `apps/api/src/funnels/update-funnel.dto.ts`:
  - Zod schema: `name` (optional, 1–200 chars, trimmed), `steps` (optional, array of `{ eventName: string }`, min length 2, max length 20 when provided).
  - Export `updateFunnelSchema` and `UpdateFunnelDto` type.
- [x] Register `FunnelsModule` in `apps/api/src/app.module.ts`.

### 3. API — Implement FunnelsService

- [x] Create `apps/api/src/funnels/funnels.service.ts`:
  - `private async verifyProjectAccess(orgId, projectId, userId)` — same pattern as `FeaturesService`: check `organizationMember` exists, check project exists and belongs to org. Throw `NotFoundException` on failure.
  - `async create(orgId, projectId, userId, dto)` — verify access, create funnel with steps in a transaction (`prisma.$transaction`). Steps get `stepOrder` from array index (0-based). Return funnel with steps ordered by `stepOrder`.
  - `async findByProject(orgId, projectId, userId)` — verify access, return all funnels for the project with step count. Order by `createdAt` desc.
  - `async findOne(orgId, projectId, userId, funnelId)` — verify access, return funnel with steps ordered by `stepOrder`. Throw `NotFoundException` if funnel not found or wrong project.
  - `async update(orgId, projectId, userId, funnelId, dto)` — verify access, find funnel, update in transaction: update name if provided, delete all existing steps and create new ones if `steps` provided. Return updated funnel with steps.
  - `async remove(orgId, projectId, userId, funnelId)` — verify access, find funnel, delete (cascade deletes steps).
  - `async getProjectEventNames(orgId, projectId, userId)` — verify access, query distinct `eventName` from `Event` where `projectId` matches and `processingStatus = 'PROCESSED'`. Return sorted array of strings.
- [x] Export `FunnelInfo` and `FunnelDetailInfo` interfaces for response typing.

### 4. API — Implement FunnelsController

- [x] Create `apps/api/src/funnels/funnels.controller.ts`:
  - Route: `organizations/:orgId/projects/:projectId/funnels`
  - `POST /` (201) — create funnel. `@Body({ schema: createFunnelSchema })`.
  - `GET /` — list funnels for project. Returns array with step counts.
  - `GET /event-names` — return distinct event names for the project (for the dropdown).
  - `GET /:funnelId` — get funnel with steps.
  - `PATCH /:funnelId` — update funnel. `@Body({ schema: updateFunnelSchema })`.
  - `DELETE /:funnelId` (204) — delete funnel. `@HttpCode(204)`.
  - All endpoints use `@CurrentUser() user: AuthUser`, `@Param('orgId')`, `@Param('projectId')`.

### 5. API — Unit tests

- [x] Create `apps/api/src/funnels/funnels.service.spec.ts`:
  - Test `create`: happy path (name + 2 steps), returns funnel with ordered steps.
  - Test `create`: non-member throws NotFoundException.
  - Test `create`: project not found throws NotFoundException.
  - Test `findByProject`: returns funnels with step counts.
  - Test `findByProject`: non-member throws NotFoundException.
  - Test `findOne`: returns funnel with steps.
  - Test `findOne`: funnel not found throws NotFoundException.
  - Test `update`: name only update.
  - Test `update`: steps replacement.
  - Test `update`: non-member throws NotFoundException.
  - Test `remove`: deletes funnel.
  - Test `remove`: non-member throws NotFoundException.
  - Test `getProjectEventNames`: returns distinct event names sorted.

### 6. API — E2E tests

- [x] Create `apps/api/test/funnels.e2e-spec.ts`:
  - `POST /organizations/:orgId/projects/:projectId/funnels`:
    - 201: creates funnel with name and steps.
    - 401: unauthenticated.
    - 404: non-member org.
    - 400: missing name, fewer than 2 steps, empty event name.
  - `GET /organizations/:orgId/projects/:projectId/funnels`:
    - 200: returns funnels with step counts.
    - 200: empty list.
    - 401: unauthenticated.
  - `GET /organizations/:orgId/projects/:projectId/funnels/:funnelId`:
    - 200: returns funnel with steps.
    - 404: wrong project/non-member.
    - 401: unauthenticated.
  - `GET /organizations/:orgId/projects/:projectId/funnels/event-names`:
    - 200: returns event names.
  - `PATCH /organizations/:orgId/projects/:projectId/funnels/:funnelId`:
    - 200: updates name.
    - 200: replaces steps.
    - 404: non-member.
  - `DELETE /organizations/:orgId/projects/:projectId/funnels/:funnelId`:
    - 204: deletes funnel.
    - 404: non-member.
    - 401: unauthenticated.

### 7. Web — Add FunnelsSection to project page

- [x] In `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx`:
  - Add `FunnelsSection` component (follows `FeaturesSection` pattern):
    - State: `funnels` list, `loading`, `error`, `showCreateForm`.
    - Fetch `GET /organizations/:orgId/projects/:projectId/funnels` on mount.
    - Display funnel cards: name, step count, created date.
    - Empty state: "No funnels defined yet. Create one to track conversion through a product flow."
    - "New funnel" button toggles create form.
  - Add `CreateFunnelForm` component:
    - Name input.
    - Steps list with "Add step" button. Each step has an event name input (with datalist of project event names from `GET .../funnels/event-names`) and a remove button.
    - Minimum 2 steps enforced (disable submit if < 2, disable remove if only 2 steps).
    - Step reordering with up/down buttons.
    - Submit calls `POST .../funnels`, refreshes list.
  - Add funnel detail view (inline expand or separate section):
    - Shows funnel name, ordered steps.
    - Edit button toggles `EditFunnelForm` (same as create form, pre-populated).
    - Delete button with `confirm()` dialog.
  - Place `FunnelsSection` after the existing analytics sections, before `EventCollectionStatus`.
  - Fetch event names for the datalist.

### 8. Web — Edit and delete funnel

- [x] `EditFunnelForm` component:
  - Pre-populated with existing funnel name and steps.
  - Same step management UI as create (add/remove/reorder).
  - Submit calls `PATCH .../funnels/:funnelId` with changed fields.
  - Cancel button returns to detail view.
- [x] Delete: calls `DELETE .../funnels/:funnelId`, refreshes list.

## Verification

Run these commands and record outcomes:

1. `pnpm --filter @userpulse/database build` — Prisma client regenerated.
2. `pnpm --filter api test` — All unit tests pass (existing + new funnel tests).
3. `pnpm --filter api test:e2e` — All e2e tests pass (if PostgreSQL available).
4. `pnpm lint` — No new lint errors.
5. `pnpm typecheck` — No new type errors.
6. `pnpm build` — All packages build successfully.
7. `pnpm format:check` — Formatting passes.

## Definition of Done

- [x] Funnel and FunnelStep Prisma models created with migration.
- [x] CRUD API endpoints implemented with org/project membership checks.
- [x] Zod validation enforces min 2 steps, name required.
- [x] Unit tests cover service methods (create, list, get, update, delete, event names).
- [x] E2E tests cover API endpoints (happy paths + auth/validation failures).
- [x] Web UI: create, list, view, edit, delete funnels.
- [x] Steps can be reordered in the UI.
- [x] Event name suggestions from project events.
- [x] All verification checks pass.
- [x] progress.md updated.

## Assumptions / open questions

- **Event name references are strings, not foreign keys.** Funnels reference event names that may not yet exist in the events table. This is intentional — users may set up funnels before events flow in.
- **Step order is 0-based.** Array index maps directly to `stepOrder`.
- **Full step replacement on edit.** When updating steps, all existing steps are deleted and new ones created. This simplifies the API and avoids complex step-level PATCH logic.
- **No conversion window in this story.** JOUR-04 (P1) adds conversion window configuration later; the model can be extended with a `conversionWindowMinutes` field on `Funnel`.
- **All org members can create/view/edit/delete funnels.** No role restriction (matches Feature behavior).
