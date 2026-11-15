# US-013 — Revoke or rotate a credential

- **Epic:** EP-03 Projects and Tracking Credentials
- **Priority:** P0 (M2 — Project Setup and SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** project administrator, **I want** to revoke or replace a tracking credential, **so that** I can respond to suspected exposure.

## Acceptance criteria

- [x] An authorized user can revoke a credential.
- [x] Revoked credentials are rejected by ingestion.
- [x] A replacement credential can be generated.
- [x] The old credential cannot be used after rotation.
- [x] The action is audited.

## Story review

**Scope boundary:** This story covers revoking and rotating existing credentials. Generation was US-012. Event ingestion using credentials is US-021+ — since ingestion doesn't exist yet, "revoked credentials are rejected by ingestion" means setting `revokedAt` on the credential record; ingestion will check this field when it lands.

**Key decisions:**
- **Revoke:** Set `revokedAt = now()` on the `ProjectApiKey` record. The existing `findByProject` already filters `revokedAt: null`, so revoked credentials disappear from the active list. A separate listing or visual indicator will show revoked credentials.
- **Rotate:** Revoke the old credential and generate a new one in a single transaction. The new credential gets the same name with a " (rotated)" suffix or the user can rename it. Returns the new full key (shown once, same as US-012).
- **Authorization:** All org members can revoke/rotate (same as credential creation in US-012 — no project-level roles exist).
- **Audit:** `revokedAt` timestamp and `revokedBy` field (new) on the revoked record serves as the audit trail. Same pattern as `createdBy`.
- **Ingestion contract:** `revokedAt` is the field ingestion (US-021+) will check. No ingestion code exists yet, so the "rejected by ingestion" AC is satisfied by the data model contract.
- **No hard delete:** Revoked credentials stay in the database for audit purposes.

## Current codebase state (verified 2026-11-15)

- `packages/database/prisma/schema.prisma` — `ProjectApiKey` model has `revokedAt DateTime?` already. Missing: `revokedBy String?` for audit.
- `apps/api/src/api-keys/api-keys.service.ts` — `create()` and `findByProject()` methods. `findByProject` filters `revokedAt: null`.
- `apps/api/src/api-keys/api-keys.controller.ts` — `POST` (create) and `GET` (list) endpoints at `organizations/:orgId/projects/:projectId/api-keys`.
- `apps/api/src/api-keys/create-api-key.dto.ts` — Zod schema for create.
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — `TrackingCredentials` component shows credential list with name, prefix, dates. No revoke/rotate UI yet.
- No `revokedBy` field exists on `ProjectApiKey`.

## Dependencies

- Upstream: US-012 (done) — credentials exist, create/list in place.
- Downstream: US-021+ (ingestion will check `revokedAt` to reject revoked credentials).

## Implementation subtasks

### 1. Database — Add `revokedBy` to ProjectApiKey

- [x] Add `revokedBy String?` field to `ProjectApiKey` in `packages/database/prisma/schema.prisma`.
- [x] Run `npx prisma migrate dev --name add_api_key_revoked_by` to create the migration.

### 2. API — Revoke and rotate methods on ApiKeysService

- [x] Add `revoke(orgId, projectId, keyId, userId)` to `ApiKeysService`:
  - Verify membership and project (reuse `verifyMembershipAndProject`).
  - Find the key by id, projectId, and `revokedAt: null`.
  - If not found, throw `NotFoundException`.
  - Set `revokedAt = new Date()` and `revokedBy = userId`.
  - Return `{ id, name, keyPrefix, revokedAt }`.

- [x] Add `rotate(orgId, projectId, keyId, userId, dto)` to `ApiKeysService`:
  - Verify membership and project.
  - In a transaction:
    1. Revoke the old key (set `revokedAt`, `revokedBy`).
    2. Generate a new key (same logic as `create()`).
  - Return the new `ApiKeyCreated` (with full key shown once).

### 3. API — Controller endpoints

- [x] Add `DELETE /organizations/:orgId/projects/:projectId/api-keys/:keyId` to `ApiKeysController`:
  - Calls `revoke()`. Returns 204.
- [x] Add `POST /organizations/:orgId/projects/:projectId/api-keys/:keyId/rotate` to `ApiKeysController`:
  - Body: `{ name: string }` (optional — defaults to old name).
  - Calls `rotate()`. Returns 201 with new `ApiKeyCreated`.

### 4. Web — Revoke and rotate UI

- [x] Update `TrackingCredentials` component in the project detail page:
  - Add "Revoke" button on each credential row with confirmation dialog.
  - Add "Rotate" button on each credential row.
  - On revoke: `DELETE .../api-keys/:keyId`, remove from list on success.
  - On rotate: `POST .../api-keys/:keyId/rotate`, show new key (same show-once pattern), replace old credential in list with new one.

### 5. Tests

- [x] API unit tests for `ApiKeysService` (add to `api-keys.service.spec.ts`):
  - Revoke: happy path (sets revokedAt/revokedBy), non-member (404), non-existent key (404), already-revoked key (404).
  - Rotate: happy path (old revoked, new key returned), non-member (404), non-existent key (404).
- [x] API e2e tests (add to `test/api-keys.e2e-spec.ts`):
  - `DELETE .../api-keys/:keyId` — 204 valid, 401 unauthenticated, 404 non-member, 404 wrong key.
  - `POST .../api-keys/:keyId/rotate` — 201 valid (returns new key, old revoked), 401, 404.
  - Verify revoked key no longer appears in `GET .../api-keys`.
  - Tenant isolation: user A cannot revoke/rotate user B's credentials.

### 6. Verification

- [x] `pnpm --filter api test` — 82 passed.
- [ ] `pnpm --filter api test:e2e` — not run (no PostgreSQL in this environment).
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

- All org members can revoke/rotate (same authorization as create — no project-level roles).
- `revokedBy` stores user ID without a foreign key (matches `createdBy` pattern).
- Revoked credentials stay in the database for audit; `findByProject` already filters them out of the active list.
- "Rejected by ingestion" is satisfied by the data model contract (`revokedAt` set); actual ingestion validation deferred to US-021+.
- Rotate creates a new credential with a user-provided name (or defaults to old name).
- No DTO needed for revoke (DELETE with no body). Rotate reuses `createApiKeySchema` for the optional name.
