# US-007 — Invite a colleague

- **Epic:** EP-02 Organizations and Membership
- **Priority:** P1 (M1 — Application Foundation)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-14) — see `harness/progress.md` for verification record
- **Created:** 2026-11-14

## Story

> **As an** organization owner, **I want** to invite a colleague, **so that** we can work in the same workspace.

## Acceptance criteria

- [x] An authorized owner can invite an email address.
- [x] The invitation belongs to the selected organization.
- [x] Duplicate active invitations are handled clearly.
- [x] Only the intended account can accept the invitation.

## Story review

**Scope boundary:** This story covers creating invitations and accepting them. Listing/managing members is US-008. This story needs:
- An `OrganizationInvitation` Prisma model (new migration)
- API endpoints for creating and accepting invitations
- Web UI for the invitation flow on the org workspace page
- An invitation acceptance page

**Key decisions:**
- **Who can invite:** Only organization OWNERs (per story: "authorized owner"). ADMINs and MEMBERs cannot invite.
- **Invitation token:** A cryptographically random token sent via a link. Stored as a SHA-256 hash (same pattern as sessions and password reset tokens). Token expires after 7 days.
- **Email delivery:** Deferred (same as password reset in US-004). The invitation URL is logged to console. Production email integration is a future concern.
- **Invitation role:** Invitees join as MEMBER by default. The owner can optionally specify ADMIN. Cannot invite as OWNER.
- **Duplicate handling:** If an active (PENDING, non-expired) invitation exists for the same email+org, return 409 Conflict with a clear message.
- **Already a member:** If the email belongs to a user who is already a member, return 409.
- **Accept flow:** `POST /invitations/accept` with the raw token. The accepting user must be authenticated and their email must match the invitation email. Creates an `OrganizationMember` record.
- **Invitation statuses:** PENDING (created), ACCEPTED (used), CANCELLED (owner revoked). Expired is determined by `expiresAt` timestamp, not a separate status.

## Current codebase state (verified 2026-11-14)

- `packages/database/prisma/schema.prisma` — Has `Organization`, `OrganizationMember`, `OrganizationRole` (OWNER/ADMIN/MEMBER). No invitation model exists yet.
- `apps/api/src/organizations/` — `OrganizationsModule` with service (create, findByUser, findOneByUser) and controller (POST, GET /, GET /:id). All membership-scoped.
- `apps/api/src/organizations/organizations.service.ts` — `OrganizationWithRole` interface, slug utilities.
- `apps/web/src/app/organizations/[id]/page.tsx` — Org workspace page (shell with placeholder content).
- `apps/web/src/app/dashboard/page.tsx` — Lists user's orgs with links.
- Auth: global `AuthenticationGuard`, `@CurrentUser()`, `@Public()` decorator. Session-cookie auth.
- ESM project: relative imports end in `.js`, tests use Vitest (`vi.fn()`), Zod for validation.

## Dependencies

- Upstream: US-005 (done) — organization creation. US-006 (done) — org workspace page.
- Downstream: US-008 (manage members) will build on the membership infrastructure.

## Implementation subtasks

### 1. Database — OrganizationInvitation model

- [ ] Add `OrganizationInvitation` model to `packages/database/prisma/schema.prisma`:
  ```prisma
  enum InvitationStatus {
    PENDING
    ACCEPTED
    CANCELLED
  }

  model OrganizationInvitation {
    id             String           @id @default(uuid())
    organizationId String
    email          String
    role           OrganizationRole @default(MEMBER)
    tokenHash      String           @unique
    status         InvitationStatus @default(PENDING)
    invitedById    String
    expiresAt      DateTime         @db.Timestamptz(6)
    createdAt      DateTime         @default(now())
    updatedAt      DateTime         @updatedAt

    organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
    invitedBy    User         @relation(fields: [invitedById], references: [id], onDelete: Cascade)

    @@unique([organizationId, email, status])
    @@index([tokenHash])
    @@index([organizationId])
    @@map("organization_invitations")
  }
  ```
  Note: The `@@unique([organizationId, email, status])` enables having one PENDING invitation per email per org while allowing ACCEPTED/CANCELLED records. Alternative: check in application code.
  Actually, this composite unique won't work well since we want to allow multiple CANCELLED but only one PENDING. Use application-level check instead.
  Use: `@@index([organizationId, email])` for fast lookup and enforce uniqueness in application code.
- [ ] Add `invitations` relation to `Organization` model and `invitations` relation to `User` model.
- [ ] Run `npx prisma migrate dev --name organization_invitations` from `packages/database`.
- [ ] Rebuild the database package: `pnpm --filter @userpulse/database build`.

### 2. API — Invitations service (`apps/api/src/organizations/`)

- [ ] Create `src/organizations/invitations.service.ts`:
  - `createInvitation(orgId: string, inviterUserId: string, dto: CreateInvitationDto)`:
    1. Verify the inviter is an OWNER of the org (query `OrganizationMember` for role).
    2. Check if the email is already a member of the org (join User on email → OrganizationMember).
    3. Check for an existing PENDING, non-expired invitation for this email+org.
    4. Generate a random token (`crypto.randomBytes(32).toString('base64url')`), hash it with SHA-256.
    5. Create `OrganizationInvitation` with status PENDING, expiresAt = now + 7 days.
    6. Log the invitation URL to console (like password reset).
    7. Return the invitation record (without tokenHash).
  - `acceptInvitation(token: string, userId: string, userEmail: string)`:
    1. Hash the token, find the invitation by tokenHash.
    2. Verify status is PENDING and not expired.
    3. Verify userEmail matches invitation email (case-insensitive).
    4. In a transaction: update invitation status to ACCEPTED, create OrganizationMember.
    5. Return the organization info.
  - `listInvitations(orgId: string, userId: string)`:
    1. Verify the user is an OWNER of the org.
    2. Return PENDING invitations for the org.
  - `cancelInvitation(orgId: string, invitationId: string, userId: string)`:
    1. Verify the user is an OWNER.
    2. Find the invitation, verify it's PENDING.
    3. Update status to CANCELLED.

- [ ] Create `src/organizations/create-invitation.dto.ts`:
  - Zod schema: `{ email: z.string().email(), role: z.enum(['ADMIN', 'MEMBER']).optional().default('MEMBER') }`.

### 3. API — Invitations controller

- [ ] Create `src/organizations/invitations.controller.ts`:
  - `POST /organizations/:orgId/invitations` — 201, body: `{ email, role? }`. Only OWNER.
  - `GET /organizations/:orgId/invitations` — 200, returns pending invitations. Only OWNER.
  - `DELETE /organizations/:orgId/invitations/:invitationId` — 204, cancels invitation. Only OWNER.
  - `POST /invitations/accept` — 200, body: `{ token }`. Authenticated user, email must match.
- [ ] Register the controllers in `OrganizationsModule`.
- [ ] The accept endpoint needs a separate top-level controller since it's not org-scoped: `src/invitations/invitations.controller.ts` with `POST /invitations/accept`.
  Actually, keep it simpler: add the accept endpoint on `InvitationsController` mounted at `/invitations`.
- [ ] Create `src/invitations/invitations.module.ts` and `src/invitations/invitations.controller.ts` for the accept endpoint. Import `OrganizationsModule` (or share the service).
  Simpler: put all invitation logic in the organizations module. The org-scoped routes go on the existing controller pattern. The accept route goes on a new controller at `/invitations`.

### 4. Web — Invite UI on org workspace page

- [ ] Update `apps/web/src/app/organizations/[id]/page.tsx`:
  - Add an "Invite member" section (visible to OWNER role — check from the org fetch response).
  - Form: email input, optional role select (MEMBER/ADMIN), submit button.
  - On submit: `POST /organizations/:id/invitations`.
  - Show success message with note that the invitation link was generated.
  - Show list of pending invitations with cancel button.
  - Handle 409 (duplicate/already member), 403 (not owner), errors.

- [ ] Create `apps/web/src/app/invitations/accept/page.tsx`:
  - Reads `?token=` from URL params.
  - On mount: `POST /invitations/accept` with the token (user must be authenticated).
  - Success: show org name, redirect to org workspace.
  - Error: show appropriate message (expired, already used, wrong account, not authenticated → redirect to login with return URL).

### 5. Tests

- [ ] API unit tests for `InvitationsService`:
  - Create invitation: happy path (owner invites email).
  - Create invitation: non-owner gets 403.
  - Create invitation: already a member gets 409.
  - Create invitation: duplicate pending invitation gets 409.
  - Accept invitation: happy path.
  - Accept invitation: wrong email gets 403.
  - Accept invitation: expired token gets 400.
  - Accept invitation: already accepted gets 400.
  - Cancel invitation: happy path.
  - List invitations: only pending, only for owner.
- [ ] API e2e tests:
  - Full invite → accept flow.
  - 401 for unauthenticated requests.
  - 403 for non-owner invite attempt.
  - 409 for duplicate invitation.
  - 409 for already-a-member email.
  - Accept with wrong email → 403.
  - Accept expired invitation → 400.
  - Cancel invitation → 204.

### 6. Verification

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

- Email delivery is deferred (console log only), consistent with US-004 password reset approach.
- Invitation expiry is 7 days. No UI to resend; owner can cancel and re-invite.
- Only OWNERs can invite, not ADMINs. This can be relaxed in US-008 if needed.
- The accept endpoint requires authentication. An unauthenticated user clicking the link will need to register/login first, then revisit the link.
- The `@@unique([organizationId, email, status])` composite constraint is NOT used — application-level check instead, to allow multiple CANCELLED records for the same email.
- Cannot invite as OWNER role (only MEMBER or ADMIN).
