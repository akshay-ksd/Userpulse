# US-012 — Generate a tracking credential

- **Epic:** EP-03 Projects and Tracking Credentials
- **Priority:** P0 (M2 — Project Setup and SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** project administrator, **I want** to generate a tracking credential, **so that** my application can submit events.

## Acceptance criteria

- [x] A credential can be generated for a specific project.
- [x] The full secret is shown only at creation time.
- [x] Only a secure hash is stored.
- [x] The credential is for event ingestion, not dashboard administration.
- [x] Credential creation is audited.

## Story review

**Scope boundary:** This story covers generating (creating) a tracking credential for a project. Revoking/rotating credentials is US-013. Event ingestion using the credential is US-021+.

**Key decisions:**
- **Who can create credentials:** All organization members can create credentials for projects in their organization. The AC says "project administrator" — since no project-level roles exist, org membership is the authorization boundary (matching project create/view/update patterns).
- **Credential format:** Generate a 32-byte random key → base64url. Store SHA-256 hash in `keyHash`. Store first 8 chars as `keyPrefix` for identification without exposing the full key.
- **Show once:** The full key is returned only in the creation response. Subsequent listing/viewing returns only `keyPrefix`, `name`, `createdAt`, etc. — never the full key.
- **Audit:** Since no `AuditLog` model exists yet, audit credential creation by including a `createdBy` reference. A full audit log system is deferred to EP-11 (US-051+). For now, the database record itself (with `createdAt` and the user who created it) serves as the audit trail.
- **Not for admin:** Credentials are scoped to event ingestion. This is a design contract — the credential will authenticate SDK event submissions (US-021+), not dashboard API calls. The credential record in `ProjectApiKey` has no admin capabilities.
- **Name field:** Required, for the user to identify the credential (e.g., "Production", "Staging").

**Schema note:** The `ProjectApiKey` model already exists in the Prisma schema and the init migration. No migration needed.

## Current codebase state (verified 2026-11-15)

- `packages/database` — `ProjectApiKey` model exists: `id` (uuid), `projectId`, `name`, `keyHash` (unique), `keyPrefix`, `createdAt`, `revokedAt` (nullable), `lastUsedAt` (nullable). Table `project_api_keys` with `@@index([projectId])`. Already in the init migration.
- `apps/api/src/projects/` — `ProjectsModule` with `ProjectsService` and `ProjectsController`. Controller at `organizations/:orgId/projects`. Service has `verifyMembership()` (private).
- `apps/web/src/app/organizations/[id]/projects/[projectId]/page.tsx` — Project detail page with placeholder "Tracking credentials and analytics will appear here."
- No `createdBy` field on `ProjectApiKey` — will need a schema change to track who created the credential for audit purposes.

## Dependencies

- Upstream: US-009 (done) — projects exist, membership verification in place.
- Downstream: US-013 (revoke/rotate), US-014+ (SDK uses credential), US-021+ (ingestion validates credential).

## Implementation subtasks

### 1. Database — Add `createdBy` to ProjectApiKey

- [x] Add `createdBy String` field to `ProjectApiKey` in `packages/database/prisma/schema.prisma`. This references the user who created the credential for audit purposes. No foreign key (matches session pattern — avoids cascade issues).
- [x] Run `npx prisma migrate dev --name add_api_key_created_by` to create the migration.

### 2. API — ApiKeys service and controller (`apps/api`)

- [x] Create `src/api-keys/create-api-key.dto.ts` — Zod schema: `{ name: string (trimmed, min 1, max 100) }`.
- [x] Create `src/api-keys/api-keys.service.ts`:
  - `create(orgId, projectId, userId, dto)`: verify membership, verify project belongs to org, generate 32-byte random key (`crypto.randomBytes(32)` → base64url), compute SHA-256 hash, extract prefix (first 8 chars of the base64url key), create `ProjectApiKey` record with `{ projectId, name: dto.name, keyHash, keyPrefix, createdBy: userId }`. Return `{ id, name, keyPrefix, key (full), createdAt }`.
  - `findByProject(orgId, projectId, userId)`: verify membership, verify project belongs to org, return all non-revoked credentials (`revokedAt: null`) with `{ id, name, keyPrefix, createdAt, lastUsedAt }` — never the full key or hash.
- [x] Create `src/api-keys/api-keys.controller.ts`:
  - `POST /organizations/:orgId/projects/:projectId/api-keys` (201) — creates credential, returns `{ id, name, keyPrefix, key, createdAt }`.
  - `GET /organizations/:orgId/projects/:projectId/api-keys` — lists credentials (no full key).
  - All protected by global auth guard.
- [x] Create `src/api-keys/api-keys.module.ts` — imports `PrismaModule`, provides `ApiKeysService`, declares `ApiKeysController`.
- [x] Register `ApiKeysModule` in `AppModule`.

### 3. Web — Credential section on project detail page (`apps/web`)

- [x] Replace the placeholder "Tracking credentials and analytics will appear here" on the project detail page with a credentials section:
  - List existing credentials: name, prefix (`up_...****`), created date, last used date.
  - "Generate credential" form: name input (required) + submit button.
  - On create success: show the full key in a prominent, copy-friendly display with a warning that it won't be shown again.
  - Handle loading, error, empty states.
- [x] Copy-to-clipboard button for the full key display.

### 4. Tests

- [x] API unit tests for `ApiKeysService` (`src/api-keys/api-keys.service.spec.ts`):
  - Creates credential with valid data, returns full key.
  - Stores SHA-256 hash (not the raw key).
  - keyPrefix matches first 8 chars of the key.
  - Rejects non-member (NotFoundException).
  - Rejects non-existent project (NotFoundException).
  - Lists credentials without full key or hash.
  - Lists only non-revoked credentials.
- [x] API e2e tests (`apps/api/test/api-keys.e2e-spec.ts`):
  - `POST .../api-keys` — 201 valid (returns key), 401 unauthenticated, 404 non-member, 400 invalid name.
  - `GET .../api-keys` — 200 with credentials (no key field), empty array, 404 non-member, 401 unauthenticated.
  - Verify stored hash matches SHA-256 of returned key.
  - Tenant isolation: user A cannot create/list credentials for user B's project.

### 5. Verification

- [x] `pnpm --filter api test` — 75 passed.
- [x] `pnpm --filter api test:e2e` — 98 passed.
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

- All org members can generate credentials (no role restriction). The AC says "project administrator" but no project-level roles exist; org membership is the boundary.
- `createdBy` stores user ID without a foreign key (matches session/password-reset-token pattern).
- No pagination for credential list in MVP.
- Full key shown only once at creation time — no way to recover it.
- Audit is via the database record itself (`createdBy`, `createdAt`). Full audit log system deferred to EP-11.
