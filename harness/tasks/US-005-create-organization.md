# US-005 — Create an organization

- **Epic:** EP-02 Organizations and Membership
- **Priority:** P0 (M1 — Application Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-14) — see `harness/progress.md` for verification record
- **Created:** 2026-11-14

## Story

> **As a** registered user, **I want** to create an organization, **so that** I can manage my company's product analytics.

## Acceptance criteria

- [x] An authenticated user can create an organization with a valid name.
- [x] The creator becomes the organization owner.
- [x] The organization appears in the user's workspace.
- [x] The user cannot access another organization's data by changing an identifier.

## Story review

The story is small and builds directly on the auth foundation (US-001–US-004). Observations:

- **Scope boundary:** Create an organization only. Listing organizations is US-006, inviting members is US-007, managing members is US-008. This story creates the org, assigns the creator as OWNER, and shows it in the user's workspace (dashboard).
- **Slug generation:** The `Organization` model has a `slug` field with a `@unique` constraint. Generate a URL-safe slug from the organization name (lowercase, hyphens, strip special chars). Handle slug collisions by appending a short random suffix.
- **Name validation:** Required, trimmed, 1–100 characters. No further constraints specified.
- **Tenant isolation:** The API must only return organizations where the user is a member. The acceptance criterion "cannot access another organization's data by changing an identifier" means all org-scoped endpoints must verify membership.
- **OrganizationMember with OWNER role:** Created in the same transaction as the organization.
- **Dashboard update:** After creating an org, the user should see their organizations listed. The current dashboard page (`/dashboard`) shows a placeholder message. Update it to show a list of the user's organizations and a "Create organization" flow.
- **No new Prisma migration needed:** `Organization`, `OrganizationMember`, and `OrganizationRole` already exist in the schema and were part of the initial migration.

## Current codebase state (verified 2026-11-14)

- `packages/database` — Prisma schema has `Organization` (id, name, slug @unique, createdAt, updatedAt), `OrganizationMember` (id, organizationId, userId, role, createdAt; @@unique([organizationId, userId])), `OrganizationRole` enum (OWNER, ADMIN, MEMBER). These models were in the initial migration.
- `apps/api` — Auth module complete (register, sign-in, sign-out, forgot/reset password). Global `AuthenticationGuard` protects all routes by default. `@Public()` decorator exempts public routes. `@CurrentUser()` provides the authenticated user. No organization module exists yet.
- `apps/web` — `/dashboard` page fetches `/me` and shows a welcome message with sign-out button. No organization UI.
- ESM project: relative imports end in `.js`, tests use Vitest (`vi.fn()`), Zod for validation.

## Dependencies

- Upstream: US-001 (done), US-002 (done) — user auth and sessions.
- Downstream: US-006 (view orgs), US-007 (invite), US-008 (manage members), US-009+ (projects require an org).

## Implementation subtasks

### 1. API — Organizations module (`apps/api`)

- [x] Create `src/organizations/organizations.module.ts` — imports `PrismaModule`, provides `OrganizationsService`, declares `OrganizationsController`.
- [x] Create `src/organizations/create-organization.dto.ts` — Zod schema: `{ name: string }` (trimmed, min 1, max 100 chars).
- [x] Create `src/organizations/organizations.service.ts`:
  - `create(userId: string, dto: CreateOrganizationDto)`: generates slug from name, creates `Organization` and `OrganizationMember` (role: OWNER) in a `$transaction`. On slug collision (Prisma P2002 on slug), retry with a random suffix (up to 3 retries).
  - `findByUser(userId: string)`: returns all organizations where the user is a member, with the user's role.
  - `findOneByUser(orgId: string, userId: string)`: returns a single organization only if the user is a member. Throws `NotFoundException` otherwise.
- [x] Create `src/organizations/organizations.controller.ts`:
  - `POST /organizations` — creates an org, returns 201 with `{ id, name, slug, createdAt, role }`.
  - `GET /organizations` — lists the user's orgs with their role.
  - `GET /organizations/:id` — returns a single org (membership-checked).
  - All endpoints protected by the global auth guard (no `@Public()`).
  - Use `@CurrentUser()` to get the authenticated user.
- [x] Register `OrganizationsModule` in `AppModule`.

### 2. API — Slug utility

- [x] Create `src/organizations/slug.ts` — `generateSlug(name: string): string` that lowercases, replaces non-alphanumeric with hyphens, trims leading/trailing hyphens, collapses consecutive hyphens, truncates to 60 chars. `appendSuffix(slug: string): string` appends `-` + 6 random alphanumeric chars.

### 3. Web — Organization creation and listing (`apps/web`)

- [x] Update `/dashboard` page to:
  - Fetch `GET /organizations` on mount (alongside `/me`).
  - If user has organizations: show a list with org name and role. Each org is a card/link.
  - If no organizations: show an empty state with a "Create organization" button.
  - "Create organization" opens a simple form (inline or modal): name field, submit button.
  - On submit: `POST /organizations` → on success, refresh the org list.
  - Handle loading, error, and empty states.
- [x] Tenant isolation on the frontend: the API enforces membership; the web app simply shows what the API returns.

### 4. Tests

- [x] API unit tests (`apps/api`, Vitest) for `OrganizationsService`:
  - Creates org and member in transaction.
  - Creator gets OWNER role.
  - Slug generation from name.
  - Slug collision retry.
  - `findByUser` returns only user's orgs.
  - `findOneByUser` throws for non-member.
- [x] API e2e tests (`apps/api`):
  - `POST /organizations` — 201 with valid name, 401 unauthenticated, 400 invalid name.
  - `GET /organizations` — returns only the user's orgs, empty for new user.
  - `GET /organizations/:id` — 200 for member, 404 for non-member, 401 unauthenticated.
  - Tenant isolation: user A cannot see user B's org via `GET /organizations/:id`.

### 5. Verification

- [x] `pnpm --filter api test` — 35 passed.
- [x] `pnpm --filter api test:e2e` — 42 passed.
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

- Slug generation is derived from the org name; no user-editable slug field for now.
- The "workspace" view for now is the dashboard showing the user's org list. A full org workspace page comes with US-006+.
- No limit on how many organizations a user can create (can be added later if needed).
- The `GET /organizations` and `GET /organizations/:id` endpoints are included here because the acceptance criteria require the org to "appear in the user's workspace" and tenant isolation to be verified.
