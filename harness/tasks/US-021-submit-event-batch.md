# US-021 — Submit an event batch

- **Epic:** EP-05 Event Ingestion and Processing
- **Priority:** P0 (M3 — Event Ingestion Pipeline)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** customer application, **I want** to submit a batch of events, **so that** product activity can be collected.

## Acceptance criteria

- [ ] Valid event batches are accepted.
- [ ] The tracking credential is validated.
- [ ] Organization and project scope are derived from the credential.
- [ ] Payload size and batch limits are enforced.
- [ ] A successful response means queue acceptance, not analytical-store persistence.
- [ ] Invalid credentials and malformed requests are rejected.

## Story review

**Scope boundary:** This story covers the ingestion HTTP endpoint that accepts event batches from the SDK. It validates the API key, validates the event payload, enriches events with tenant context (org/project from credential), and stores them for downstream processing. Downstream queue processing (US-023), event normalization (US-022), deduplication (US-024), and event status UI (US-025) are separate stories.

**Key decisions:**

- **Endpoint:** `POST /v1/events` — matches the SDK's default endpoint `https://api.userpulse.dev/v1/events`. This is a public endpoint authenticated by API key only (no session auth, no CSRF).
- **Auth mechanism:** `Authorization: Bearer <apiKey>` header. Look up by `SHA-256(apiKey)` against `ProjectApiKey.keyHash`. Key must not be revoked (`revokedAt IS NULL`). Project must be ACTIVE.
- **MVP storage:** The architecture calls for SQS as the queue. Since SQS is not available in the dev environment, use a PostgreSQL staging table (`Event`) as the intermediate store. This matches the architecture's intent (decouple acceptance from analytics persistence) while being practical for MVP. The table stores raw validated events for later processing by US-023.
- **Batch limits:** Max 100 events per batch (matches SDK `maxQueueSize`). Max 1MB total payload size.
- **Response semantics:** 202 Accepted — the response means events were accepted into the staging store (queue), not that they are in ClickHouse. Response includes `{ accepted: number }`.
- **CORS:** The ingestion endpoint must allow any origin (SDK runs in customer browsers). Separate from the dashboard CORS config.
- **No CSRF:** Public SDK endpoint — no session cookies, no CSRF protection.
- **lastUsedAt update:** Update `ProjectApiKey.lastUsedAt` on successful ingestion to support US-025.
- **Event schema:** Each event must have `eventId` (UUID), `eventName` (non-empty string), `timestamp` (ISO 8601). Optional: `anonymousId`, `userId`, `properties`, `sdkVersion`.

**Out of scope:**
- SQS integration (production queue) — deferred to infrastructure setup
- ClickHouse storage — US-023+
- Event normalization — US-022
- Deduplication logic — US-024
- Event collection status UI — US-025

## Current codebase state (verified 2026-11-15)

- `apps/api/src/app.module.ts` — Existing modules: `PrismaModule`, `AuthModule`, `OrganizationsModule`, `ProjectsModule`, `ApiKeysModule`. No ingestion module.
- `apps/api/src/app.setup.ts` — Global `StandardSchemaValidationPipe`, CORS restricted to `WEB_ORIGIN`, CSRF protection enabled. The ingestion endpoint will need different CORS (any origin) and no CSRF.
- `apps/api/src/api-keys/api-keys.service.ts` — Has `verifyMembershipAndProject()` for dashboard auth. The ingestion path needs a different lookup: find key by hash, get project/org from the key record.
- `packages/database/prisma/schema.prisma` — `ProjectApiKey` model with `keyHash` (unique), `revokedAt`, `lastUsedAt`, relation to `Project` (which has `organizationId` and `status`). No `Event` model.
- `packages/sdk/src/client.ts` — SDK sends `POST` with `Authorization: Bearer <apiKey>`, body `{ batch: [{ eventId, eventName, timestamp, anonymousId, userId?, properties?, sdkVersion }] }`.
- No `apps/ingestion/` directory exists (architecture shows it as separate, but for MVP we add the endpoint to the existing API app).

## Dependencies

- **Upstream:** US-012 (done — API keys exist), US-013 (done — revocation exists), US-014–US-020 (done — SDK sends events).
- **Downstream:** US-022 (validate/normalize), US-023 (process queued events), US-024 (deduplication), US-025 (event collection status UI).

## Implementation subtasks

### 1. Database — Add Event staging table

- [ ] Add `Event` model to `packages/database/prisma/schema.prisma`:
  ```prisma
  model Event {
    id              String   @id @default(uuid())
    organizationId  String
    projectId       String
    eventId         String
    eventName       String
    anonymousId     String?
    userId          String?
    properties      Json?
    sdkVersion      String?
    eventTimestamp   DateTime
    ingestedAt      DateTime @default(now())
    processed       Boolean  @default(false)

    @@index([projectId, ingestedAt])
    @@index([processed, ingestedAt])
    @@index([eventId])
    @@map("events")
  }
  ```
- [ ] Run `npx prisma migrate dev --name add_events_table` to create the migration.

### 2. API — Ingestion module (`apps/api/src/ingestion/`)

- [ ] Create `src/ingestion/ingestion.module.ts` — imports `PrismaModule`, provides `IngestionService`, declares `IngestionController`.
- [ ] Create `src/ingestion/submit-events.dto.ts` — Zod schema for the request body:
  ```typescript
  const eventSchema = z.object({
    eventId: z.string().uuid(),
    eventName: z.string().min(1).max(500),
    timestamp: z.string().datetime(),
    anonymousId: z.string().max(200).optional(),
    userId: z.string().max(200).optional(),
    properties: z.record(z.unknown()).optional(),
    sdkVersion: z.string().max(50).optional(),
  });

  const submitEventsSchema = z.object({
    batch: z.array(eventSchema).min(1).max(100),
  });
  ```
- [ ] Create `src/ingestion/api-key.guard.ts` — Custom NestJS guard:
  - Extract `Authorization: Bearer <key>` from request header.
  - Compute `SHA-256(key)`.
  - Look up `ProjectApiKey` by `keyHash`, include `project` relation.
  - Reject if key not found, revoked (`revokedAt` is set), or project not ACTIVE.
  - Attach `{ projectId, organizationId, apiKeyId }` to the request object.
  - Return 401 for missing/invalid auth, 403 for revoked key or archived project.
- [ ] Create `src/ingestion/ingestion.service.ts`:
  - `submitBatch(organizationId, projectId, apiKeyId, batch)`:
    - Map SDK events to `Event` records, adding `organizationId`, `projectId`, `ingestedAt`.
    - Insert using `prisma.event.createMany({ data: [...] })`.
    - Update `ProjectApiKey.lastUsedAt` (fire-and-forget, don't fail the request if this fails).
    - Return `{ accepted: batch.length }`.
- [ ] Create `src/ingestion/ingestion.controller.ts`:
  - `POST /v1/events` — uses `ApiKeyGuard`, Zod validation via `@Body({ schema: submitEventsSchema })`.
  - Returns 202 with `{ accepted: number }`.
  - No session auth guard (must bypass the global `AuthenticationGuard`).
- [ ] Register `IngestionModule` in `AppModule`.

### 3. API — CORS and auth bypass for ingestion endpoint

- [ ] Update `apps/api/src/app.setup.ts` to configure CORS to also allow any origin for `/v1/*` paths. Options:
  - Use NestJS CORS `origin` as a function: if path starts with `/v1/`, allow any origin; otherwise restrict to `WEB_ORIGIN`.
  - Or set CORS to allow all origins (since session cookies are `SameSite=Lax` and `__Host-` prefixed, they won't be sent cross-origin anyway). The simpler option is preferred for MVP.
- [ ] Mark the ingestion controller/method as `@Public()` to bypass the global `AuthenticationGuard` (same pattern as `register` and `signIn` in `AuthController`).
- [ ] Ensure the CSRF protection does not block the ingestion endpoint. Since CSRF protection relies on session cookies and the ingestion endpoint uses Bearer auth, it should not conflict — but verify.

### 4. API — Payload size limit

- [ ] Add a payload size limit for the ingestion endpoint. Use NestJS body parser limit or a custom guard. 1MB max for the raw body. Return 413 if exceeded.

### 5. Tests

- [ ] **Unit tests** (`src/ingestion/ingestion.service.spec.ts`):
  - Accepts valid batch, returns `{ accepted: N }`.
  - Inserts events with correct org/project context.
  - Updates `lastUsedAt` on the API key.
- [ ] **Unit tests** (`src/ingestion/api-key.guard.spec.ts`):
  - Allows valid, active API key.
  - Rejects missing Authorization header (401).
  - Rejects malformed Authorization header (401).
  - Rejects unknown key hash (401).
  - Rejects revoked key (403).
  - Rejects archived project (403).
  - Attaches project/org context to request.
- [ ] **E2E tests** (`apps/api/test/ingestion.e2e-spec.ts`):
  - `POST /v1/events` with valid key and batch → 202 with `{ accepted: N }`.
  - Events stored in database with correct org/project IDs.
  - Missing Authorization → 401.
  - Invalid key → 401.
  - Revoked key → 403.
  - Archived project → 403.
  - Empty batch → 400.
  - Batch exceeding 100 events → 400.
  - Invalid event (missing eventId, bad timestamp) → 400.
  - `lastUsedAt` updated on API key after successful ingestion.
  - Cross-origin request works (CORS headers present).

### 6. Verification

- [ ] `pnpm --filter api test` — all pass.
- [ ] `pnpm --filter api test:e2e` — all pass (requires PostgreSQL).
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

- **PostgreSQL as MVP queue:** Using a PostgreSQL `events` table as the staging store instead of SQS. This is appropriate for MVP; migration to SQS is a production infrastructure concern.
- **Endpoint in the API app:** The architecture shows `apps/ingestion/` as a separate service. For MVP, the endpoint lives in the existing NestJS API app under `/v1/events`. Extraction to a separate Lambda is a deployment concern.
- **1MB payload / 100 events:** Batch size matches SDK `maxQueueSize`. Payload limit is a reasonable starting point.
- **202 Accepted:** Not 200 OK — communicates queue acceptance semantics per the acceptance criteria.
- **No rate limiting yet:** Rate limiting for the ingestion endpoint is deferred (same as other endpoints).
- **CORS any-origin:** Safe because the endpoint uses Bearer auth, not cookies. Session cookies are `SameSite=Lax` and `__Host-` prefixed so they won't leak.
