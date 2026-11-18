# US-028 — Map events to a feature

- **Epic:** EP-06 Feature Management
- **Priority:** P0 (M4 — Feature Management and Analytics Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Not Started
- **Created:** 2026-11-15

## Story

> **As a** product manager, **I want** to associate event names with a feature, **so that** the platform can calculate feature usage and adoption.

## Acceptance criteria

- [ ] Users can map one or more project event names to a feature.
- [ ] Existing mappings are visible.
- [ ] Mappings can be changed or removed.
- [ ] Mappings cannot cross project boundaries.
- [ ] Analytics use mapping rules consistently.

## Story review

**Scope boundary:** This story adds the `FeatureEventMapping` model (as specified in the architecture) and CRUD endpoints for managing which event names belong to which feature. A feature can have many event name mappings; an event name within a project can belong to at most one feature (unique constraint on `projectId + eventName`).

**Key decisions:**

- **Data model:** New `FeatureEventMapping` model with `id`, `featureId`, `projectId`, `eventName`, `createdAt`. Unique constraint on `(projectId, eventName)` ensures an event name maps to at most one feature within a project. `projectId` is denormalized from the feature's project for the unique constraint and query efficiency.
- **API endpoints** (nested under features):
  - `PUT /organizations/:orgId/projects/:projectId/features/:featureId/mappings` — set the full list of event name mappings for a feature (replace strategy: removes old, adds new).
  - `GET /organizations/:orgId/projects/:projectId/features/:featureId/mappings` — list mappings for a feature.
  - `DELETE /organizations/:orgId/projects/:projectId/features/:featureId/mappings/:mappingId` — remove a single mapping.
- **Cross-project boundary enforcement:** The feature must belong to the specified project; the API verifies `feature.projectId === projectId`. The unique constraint prevents the same event name being mapped to two features in the same project.
- **Conflict handling:** If an event name is already mapped to a different feature in the same project, return 409 with a clear message naming the conflicting feature.
- **Web UI:** Add an "Event mappings" expandable section per feature in the `FeaturesSection` component, showing current mappings with add/remove controls.
- **AC5 (Analytics use mapping rules consistently):** This AC is forward-looking. The mapping data structure is the foundation; actual analytics queries (EP-07) will join on these mappings. This story ensures the data model supports consistent lookups. No analytics code changes needed yet.

**Out of scope:**
- Unmapped events listing (US-029)
- Analytics queries using mappings (EP-07)
- Auto-suggesting event names from collected events (could enhance UX later)

## Current codebase state (verified 2026-11-15)

- `packages/database/prisma/schema.prisma` — `Feature` model exists with `projectId`, `status`, etc. No `FeatureEventMapping` model yet. Architecture specifies it should exist here.
- `apps/api/src/features/` — `FeaturesModule`, `FeaturesService`, `FeaturesController` with create/update/list. Pattern to extend.
- `apps/api/src/features/features.service.ts` — Has `verifyProjectAccess()` helper.
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — `FeaturesSection` component with create/edit/archive/list. Extend with mapping UI.
- `packages/database/prisma/schema.prisma` — `Event` model has `eventName` and `projectId` fields.

## Dependencies

**Upstream (must be Done):**
- US-026 — Create a product feature (Done) — Feature model and API
- US-027 — Edit or archive a feature (Done) — Feature CRUD

**Downstream (depends on this):**
- US-029 — Find unmapped events
- US-030+ — Product analytics (will query mappings)

## Implementation subtasks

### 1. Database — FeatureEventMapping model

- [ ] **1.1** Add `FeatureEventMapping` model to `packages/database/prisma/schema.prisma`:
  ```prisma
  model FeatureEventMapping {
    id        String   @id @default(uuid())
    featureId String
    projectId String
    eventName String
    createdAt DateTime @default(now())

    feature Feature @relation(fields: [featureId], references: [id], onDelete: Cascade)
    project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

    @@unique([projectId, eventName])
    @@index([featureId])
    @@map("feature_event_mappings")
  }
  ```
- [ ] **1.2** Add `mappings FeatureEventMapping[]` relation to `Feature` model and `featureEventMappings FeatureEventMapping[]` to `Project` model.
- [ ] **1.3** Run `pnpm --filter @userpulse/database prisma migrate dev --name add_feature_event_mappings`.
- [ ] **1.4** Run `pnpm --filter @userpulse/database build`.

### 2. API — Mapping endpoints

- [ ] **2.1** Create `apps/api/src/features/mapping.dto.ts`:
  - `setMappingsSchema`: `z.object({ eventNames: z.array(z.string().trim().min(1).max(200)).min(0).max(100) })`
  - Export `SetMappingsDto` type.

- [ ] **2.2** Add mapping methods to `FeaturesService`:
  - `getMappings(orgId, projectId, featureId, userId)` — verify access, verify feature belongs to project, return mappings.
  - `setMappings(orgId, projectId, featureId, userId, eventNames)` — verify access, verify feature belongs to project, check for conflicts (event name already mapped to a *different* feature in the same project), delete old mappings for this feature, create new ones. Use a transaction.
  - `removeMapping(orgId, projectId, featureId, mappingId, userId)` — verify access, verify mapping belongs to this feature, delete it.

- [ ] **2.3** Add mapping endpoints to `FeaturesController`:
  - `GET :featureId/mappings` → `getMappings()`
  - `PUT :featureId/mappings` → `setMappings()` with `setMappingsSchema`
  - `DELETE :featureId/mappings/:mappingId` → `removeMapping()`

- [ ] **2.4** Update `FeatureInfo` type in service to optionally include `mappingCount` and return it from `findByProject`.

### 3. API — Unit tests

- [ ] **3.1** Add tests to `apps/api/src/features/features.service.spec.ts`:
  - `getMappings` — happy path, feature not found, non-member
  - `setMappings` — happy path (add new), replace existing, conflict (409), empty array (clear all), non-member
  - `removeMapping` — happy path, mapping not found, non-member

### 4. API — E2E tests

- [ ] **4.1** Add tests to `apps/api/test/features.e2e-spec.ts` (or create if not exists):
  - GET mappings 200/404/401
  - PUT mappings 200/409/400/404/401
  - DELETE mapping 204/404/401

### 5. Web — Event mapping UI

- [ ] **5.1** Add mapping management to `FeaturesSection` in the project detail page:
  - Each feature item shows a count of mapped events (e.g. "3 events mapped").
  - Clicking a feature expands to show its mapped event names.
  - Add form: text input for event name + "Add" button.
  - Each mapping has a "Remove" button.
  - Conflict errors (409) are shown inline.

### 6. Verification

- [ ] Run `pnpm --filter api test` — unit tests pass
- [ ] Run `pnpm lint` — pass
- [ ] Run `pnpm typecheck` — pass
- [ ] Run `pnpm build` — pass
- [ ] Run `pnpm format:check` — pass

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

- Event name is a free-text string matching what the SDK sends (e.g. `button_click`, `$page`). No validation against actually collected events at this stage.
- PUT replaces all mappings for a feature (simpler than individual add operations). Individual removal via DELETE is also supported.
- `projectId` is denormalized on the mapping for the unique constraint; the architecture implies this by listing both Feature and FeatureEventMapping as PostgreSQL entities.
- AC5 is satisfied by the data model existing and being queryable; actual analytics queries will use it in EP-07.
