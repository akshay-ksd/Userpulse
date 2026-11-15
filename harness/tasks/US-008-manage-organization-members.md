# US-008 — Manage organization members

- **Epic:** EP-02 Organizations and Membership
- **Priority:** P1 (M1 — Application Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As an** organization owner, **I want** to view and manage members, **so that** I can control workspace access.

## Acceptance criteria

- [x] The owner can view members and their roles.
- [x] Authorized owners can remove members.
- [x] Removed members lose access.
- [x] The last owner cannot accidentally leave the organization without an owner.

## Story review

**Scope boundary:** This story covers listing members and removing them. Changing roles is not in the acceptance criteria and is out of scope. Invitations are US-007 (done).

**Key decisions:**
- **Who can view members:** All org members can view the member list (the AC says the owner CAN view, not that ONLY the owner can — allowing all members to see their peers is standard).
- **Who can remove members:** Only OWNERs can remove members.
- **Self-removal:** An owner can remove themselves only if another owner exists. The last owner cannot be removed.
- **Remove vs leave:** Removing another member is an owner action. Self-removal (leaving) follows the same endpoint but with the last-owner guard.
- **No role changes:** Out of scope for this story.
- **Response after removal:** The member row is deleted. Subsequent API calls by that user to this org return 404 (handled by existing `findOneByUser` membership check).

## Current codebase state (verified 2026-11-15)

- `packages/database/prisma/schema.prisma` — `OrganizationMember` model with `@@unique([organizationId, userId])`. Has `id`, `organizationId`, `userId`, `role`, `createdAt`. Relations to `Organization` and `User`.
- `apps/api/src/organizations/organizations.service.ts` — `OrganizationsService` with `create`, `findByUser`, `findOneByUser`. Returns `OrganizationWithRole`.
- `apps/api/src/organizations/organizations.controller.ts` — `OrganizationsController` at `/organizations` with POST, GET, GET /:id.
- `apps/api/src/organizations/organizations.module.ts` — Exports `OrganizationsService`, `InvitationsService`.
- `apps/web/src/app/organizations/[id]/page.tsx` — Org workspace page with invite form and pending invitations (OWNER only).
- Auth: global `AuthenticationGuard`, `@CurrentUser()` decorator, session-cookie auth.
- ESM project: relative imports end in `.js`, Vitest, Zod for validation.

## Dependencies

- Upstream: US-005 (done) — org creation + membership. US-007 (done) — invitations create members.
- Downstream: US-009+ (projects) will use the same org membership checks.

## Implementation subtasks

### 1. API — Members service methods

- [ ] Add `listMembers(orgId: string, userId: string)` to `OrganizationsService`:
  1. Verify the requesting user is a member of the org (query `OrganizationMember`).
  2. Return all members with user info (id, email, name, role, createdAt).
  3. Include member's `OrganizationMember.id` for removal targeting.
- [ ] Add `removeMember(orgId: string, memberId: string, userId: string)` to `OrganizationsService`:
  1. Verify the requesting user is an OWNER of the org.
  2. Find the target member by `memberId` in the org.
  3. If target member is an OWNER, count remaining owners. If only one owner remains, throw `BadRequestException`.
  4. Delete the `OrganizationMember` record.
  5. Return void (204).

### 2. API — Members controller endpoints

- [ ] Add to `OrganizationsController`:
  - `GET /organizations/:id/members` — 200, returns member list. Any org member.
  - `DELETE /organizations/:id/members/:memberId` — 204, removes member. OWNER only.

### 3. Web — Members section on org workspace page

- [ ] Update `apps/web/src/app/organizations/[id]/page.tsx`:
  - Add a "Members" section visible to all org members.
  - Fetch `GET /organizations/:id/members` on mount.
  - Display members: name (or email), role badge, join date.
  - OWNER sees a "Remove" button on each member except themselves if they're the last owner.
  - Handle removal confirmation and error states.
  - Refresh list after removal.

### 4. Tests

- [ ] API unit tests for `OrganizationsService` member methods:
  - List members: happy path (member can view).
  - List members: non-member gets 404.
  - Remove member: owner removes a member.
  - Remove member: non-owner gets 403.
  - Remove member: last owner protection.
  - Remove member: member not found gets 404.
- [ ] API e2e tests:
  - `GET /organizations/:id/members` — 200 with member list.
  - `GET /organizations/:id/members` — 401 unauthenticated.
  - `GET /organizations/:id/members` — 404 non-member.
  - `DELETE /organizations/:id/members/:memberId` — 204 owner removes member.
  - `DELETE /organizations/:id/members/:memberId` — 403 non-owner attempts removal.
  - `DELETE /organizations/:id/members/:memberId` — 400 last owner protection.
  - `DELETE /organizations/:id/members/:memberId` — 401 unauthenticated.
  - Verify removed member loses access (GET /organizations/:id returns 404).

### 5. Verification

- [ ] `pnpm --filter api test` — all pass.
- [ ] `pnpm --filter api test:e2e` — all pass.
- [ ] `pnpm lint` — pass.
- [ ] `pnpm typecheck` — pass.
- [ ] `pnpm build` — pass.
- [ ] `pnpm format:check` — pass.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] The solution follows the approved architecture and existing project conventions.
- [ ] Changes are limited to the task and necessary related updates.
- [ ] Relevant tests have been added or updated.
- [ ] Relevant tests and checks have been executed.
- [ ] Authorization and tenant isolation have been verified.
- [ ] API contracts are documented in the code (DTOs, response types).
- [ ] No unrelated changes or destructive operations have been introduced.
- [ ] The final report accurately describes changes, verification, and remaining limitations.

## Assumptions / open questions

- No role change capability in this story (only view and remove).
- All org members can view the member list. Only OWNERs can remove.
- An owner can remove themselves (leave the org) if at least one other owner exists.
- No database migration needed — existing `OrganizationMember` model is sufficient.
