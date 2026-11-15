# US-009 — Create a project

- **Epic:** EP-03 Projects and Tracking Credentials
- **Priority:** P0 (M2 — Project Setup and SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As an** organization member with permission, **I want** to create a project, **so that** I can track usage for a digital product.

## Acceptance criteria

- [x] The user can create a project with a valid name.
- [x] The project belongs to the selected organization.
- [x] Unauthorized users cannot create projects.
- [x] The project appears in the organization's project list.

## Story review

**Scope boundary:** This story covers creating and listing projects within an organization. Project editing/archiving is US-011, tracking credentials are US-012/013.

**Key decisions:**
- **Who can create projects:** All organization members (OWNER, ADMIN, MEMBER) can create projects. The AC says "organization member with permission" — since no role-based restriction is specified for project creation, all members can create. If only owners/admins should create, that's a separate story.
- **Project model:** Already exists in Prisma schema with `id`, `organizationId`, `name`, `description` (optional), `status` (ACTIVE/ARCHIVED), `createdAt`, `updatedAt`. No migration needed.
- **Name validation:** Required, trimmed, 1–100 characters. Description optional, max 500 chars.
- **Listing:** `GET /organizations/:orgId/projects` returns projects for the org. Membership is verified.
- **Single project view:** `GET /organizations/:orgId/projects/:projectId` returns one project. Verifies membership and project belongs to the org.
- **Tenant isolation:** Projects are scoped to the organization. A user can only see projects for orgs they belong to. Changing the org ID or project ID in the URL must not leak data.
- **No ProjectApiKey management:** That's US-012/013.

## Current codebase state (verified 2026-11-15)

- `packages/database` — Prisma schema has `Project` (id, organizationId, name, description, status, createdAt, updatedAt; @@index([organizationId])) and `ProjectApiKey` (not needed for this story). `Organization` has a `projects Project[]` relation. `ProjectStatus` enum (ACTIVE, ARCHIVED) exists. No migration needed.
- `apps/api` — Organizations module has `OrganizationsService` with `findOneByUser()` for membership checks. Auth guard protects all routes. Pattern: controller method gets `@CurrentUser()`, service method takes `userId`, checks membership, performs operation.
- `apps/web` — `/organizations/[id]` workspace page has a placeholder "Projects and settings will appear here." Ready to replace with a project list and create form.
- ESM project: relative imports end in `.js`, tests use Vitest (`vi.fn()`), Zod for validation.

## Dependencies

- Upstream: US-005 (done) — organizations exist. US-001/002 (done) — auth.
- Downstream: US-010 (view projects — partially covered here with listing), US-011 (update/archive), US-012/013 (tracking credentials).

## Implementation subtasks

### 1. API — Projects module (`apps/api`)

- [x] Create `src/projects/projects.module.ts` — imports `PrismaModule`, provides `ProjectsService`, declares `ProjectsController`.
- [x] Create `src/projects/create-project.dto.ts` — Zod schema: `{ name: string (trimmed, min 1, max 100), description?: string (trimmed, max 500) }`.
- [x] Create `src/projects/projects.service.ts`:
  - `create(orgId, userId, dto)`: verify membership via `organizationMember.findUnique()`, throw `NotFoundException` for non-members. Create `Project` with `organizationId: orgId`. Return project.
  - `findByOrganization(orgId, userId)`: verify membership, return all ACTIVE projects for the org ordered by `createdAt desc`.
  - `findOne(orgId, projectId, userId)`: verify membership, find project where `id: projectId` and `organizationId: orgId`. Throw `NotFoundException` if not found or wrong org.
- [x] Create `src/projects/projects.controller.ts`:
  - `POST /organizations/:orgId/projects` (201) — creates project, returns `{ id, organizationId, name, description, status, createdAt }`.
  - `GET /organizations/:orgId/projects` — lists org's projects.
  - `GET /organizations/:orgId/projects/:projectId` — returns single project.
  - All protected by global auth guard.
- [x] Register `ProjectsModule` in `AppModule`.

### 2. Web — Project list and create form (`apps/web`)

- [x] Update `/organizations/[id]` workspace page:
  - Replace placeholder with a project list section.
  - Fetch `GET /organizations/:id/projects` on mount.
  - Show project cards with name, description snippet, status, creation date.
  - Empty state: "No projects yet. Create one to start tracking."
  - "Create project" form: name (required) + description (optional), submit button.
  - On submit: `POST /organizations/:id/projects` → refresh list on success.
  - Handle loading, error states.
- [x] Create `/organizations/[id]/projects/[projectId]` page:
  - Fetch `GET /organizations/:id/projects/:projectId`.
  - Show project name, description, status, creation date.
  - Placeholder for tracking credentials and settings (future stories).
  - Handle 401 (redirect to login), 404 (not found), error states.
  - Link back to org workspace.

### 3. Tests

- [x] API unit tests for `ProjectsService`:
  - Creates project with valid data.
  - Rejects non-member (NotFoundException).
  - `findByOrganization` returns only org's projects.
  - `findByOrganization` rejects non-member.
  - `findOne` returns project for member.
  - `findOne` rejects non-member.
  - `findOne` throws for wrong org.
- [x] API e2e tests (`apps/api/test/projects.e2e-spec.ts`):
  - `POST /organizations/:orgId/projects` — 201 valid, 401 unauthenticated, 404 non-member, 400 invalid name.
  - `GET /organizations/:orgId/projects` — 200 with projects, empty array for org with no projects, 404 non-member, 401 unauthenticated.
  - `GET /organizations/:orgId/projects/:projectId` — 200 for member, 404 non-member org, 404 wrong project ID, 401 unauthenticated.
  - Tenant isolation: user A cannot see user B's org's projects.

### 4. Verification

- [x] `pnpm --filter api test` — 63 passed.
- [x] `pnpm --filter api test:e2e` — 77 passed (1 pre-existing failure in `app.e2e-spec.ts` unrelated to this change).
- [x] `pnpm lint` — pass.
- [x] `pnpm typecheck` — pass.
- [x] `pnpm build` — pass.
- [x] `pnpm format:check` — pass.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] The solution follows the approved architecture and existing project conventions.
- [x] Changes are limited to the task and necessary related updates.
- [x] Relevant tests have been added or updated.
- [x] Relevant tests and checks have been executed.
- [x] Authorization and tenant isolation have been verified.
- [x] API contracts are documented in the code (DTOs, response types).
- [x] No unrelated changes or destructive operations have been introduced.
- [x] The final report accurately describes changes, verification, and remaining limitations.

## Assumptions / open questions

- All org members can create projects (no role restriction). Can be tightened later.
- Projects are listed with ACTIVE status only. Archived projects are out of scope (US-011).
- No pagination for project list in MVP (unlikely to have many projects per org initially).
- The project detail page is a shell with placeholder content for tracking credentials and settings.
