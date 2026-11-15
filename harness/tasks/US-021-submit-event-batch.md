# US-021 — Submit an event batch

- **Epic:** EP-05 Event Ingestion and Processing
- **Priority:** P0 (M3 — Event Ingestion Pipeline)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** customer application, **I want** to submit a batch of events, **so that** product activity can be collected.

## Acceptance criteria

- [x] Valid event batches are accepted.
- [x] The tracking credential is validated.
- [x] Organization and project scope are derived from the credential.
- [x] Payload size and batch limits are enforced.
- [x] A successful response means queue acceptance, not analytical-store persistence.
- [x] Invalid credentials and malformed requests are rejected.

## Story review

### Scope boundaries

- **In scope:** A public event ingestion endpoint that accepts batches of events from the SDK, validates the tracking credential (API key), derives org/project scope, validates the batch structure, and acknowledges acceptance. For MVP without AWS infrastructure, events will be stored in-memory or a simple queue table rather than SQS — the architecture's queue semantics are preserved in the API contract (202 Accepted = queued, not persisted).
- **Out of scope:** SQS/Lambda integration (infrastructure), ClickHouse persistence (US-023), event normalization/validation of individual event fields (US-022), deduplication (US-024), event status UI (US-025).

### Key decisions

1. **Endpoint:** `POST /v1/events` — a separate public endpoint outside the authenticated dashboard API. This endpoint uses API key auth (`Authorization: Bearer <key>`), not session cookies.
2. **Authentication:** Hash the incoming API key with SHA-256 and look up `ProjectApiKey.keyHash`. If found and not revoked, derive `projectId` and `organizationId`. Also check that the project is ACTIVE (not ARCHIVED).
3. **Batch limits:** Max 100 events per batch (matches SDK `maxQueueSize`). Max payload size 1MB (enforced via body-parser limit on the ingestion route).
4. **Event validation (lightweight):** Each event must have `eventId` (string, UUID format), `eventName` (non-empty string), and `timestamp` (ISO 8601 string). Other fields are optional. Deep validation of properties is US-022.
5. **Response semantics:** `202 Accepted` with `{ accepted: true, eventCount: N }` — explicitly means queued for processing, not persisted. The response does not promise ClickHouse storage.
6. **Queue strategy (MVP):** Since we don't have SQS in this environment, store accepted events in a PostgreSQL `event_queue` table as a durable queue. This preserves the async processing contract and can be swapped for SQS later. Events are stored as JSONB batches with project/org metadata.
7. **No session auth:** This endpoint must NOT require cookie-based session auth. It uses only the API key. The endpoint needs a separate controller/guard that bypasses the global `AuthenticationGuard`.

### Edge cases

- Revoked API key → 401 Unauthorized.
- Archived project → 403 Forbidden (project is not accepting events).
- Empty batch → 400 Bad Request.
- Batch over 100 events → 400 Bad Request.
- Malformed JSON → 400 Bad Request (handled by body-parser).
- Missing/invalid Authorization header → 401 Unauthorized.
- Individual events with missing required fields → 400 with details of which events failed validation.

## Current codebase state

- **API keys:** `ApiKeysService` in `apps/api/src/api-keys/` stores keys as SHA-256 hashes. `ProjectApiKey` model has `keyHash`, `projectId`, `revokedAt`. The service has `verifyMembershipAndProject()` but no public method to look up a key by its hash.
- **Prisma schema:** `ProjectApiKey` model with `keyHash @unique`, `revokedAt`, `lastUsedAt`. `Project` has `organizationId` and `status` (ACTIVE/ARCHIVED).
- **Auth:** Global `AuthenticationGuard` from `@nestjs/authentication` protects all routes except `@Public()` ones. The ingestion endpoint needs to bypass this guard and use API key auth instead.
- **App module:** `AppModule` imports `AuthenticationModule.forRoot()`, `PrismaModule`, `AuthModule`, `OrganizationsModule`, `ProjectsModule`, `ApiKeysModule`.
- **SDK:** Sends `POST` to `config.endpoint` with `Authorization: Bearer <apiKey>`, body `{ batch: UserpulseEvent[] }`. Events have `eventId`, `eventName`, `timestamp`, `anonymousId`, optional `userId`, `sessionId`, `properties`, `pageName`, `pagePath`, `sdkVersion`.
- **No ingestion module exists yet.**

## Dependencies

- **Upstream:** US-012 (Generate tracking credential) — Done. US-013 (Revoke/rotate credential) — Done. US-014–020 (SDK) — Done.
- **Downstream:** US-022 (Validate and normalize events), US-023 (Process queued events), US-024 (Prevent duplicates), US-025 (View event status).

## Implementation subtasks

### 1. Database — Event queue table (`packages/database`)

- [ ] Add `EventBatch` model to Prisma schema:
  ```
  model EventBatch {
    id             String   @id @default(uuid())
    organizationId String
    projectId      String
    events         Json     // The batch of events as JSONB
    eventCount     Int
    status         EventBatchStatus @default(PENDING)
    createdAt      DateTime @default(now())
    processedAt    DateTime?

    @@index([status, createdAt])
    @@index([projectId])
    @@map("event_batches")
  }

  enum EventBatchStatus {
    PENDING
    PROCESSING
    DONE
    FAILED
  }
  ```
- [ ] Generate and apply Prisma migration.

### 2. API — Ingestion module (`apps/api/src/ingestion/`)

- [ ] Create `IngestionModule` with `IngestionController` and `IngestionService`.
- [ ] **`ingestion.dto.ts`** — Zod schema for the request body:
  - `batch`: array of event objects (min 1, max 100).
  - Each event: `eventId` (string, UUID), `eventName` (non-empty string, max 200 chars), `timestamp` (ISO 8601 string). Optional: `anonymousId`, `userId`, `sessionId`, `properties` (object), `pageName`, `pagePath`, `sdkVersion`.
- [ ] **`api-key.guard.ts`** — Custom guard for API key authentication:
  - Extract `Authorization: Bearer <key>` from request headers.
  - Hash the key with SHA-256.
  - Look up `ProjectApiKey` by `keyHash` where `revokedAt` is null.
  - Load the associated `Project` (with `organizationId`).
  - Check project status is ACTIVE.
  - Attach `{ projectId, organizationId, apiKeyId }` to the request.
  - Return 401 for missing/invalid/revoked keys.
  - Return 403 for archived projects.
- [ ] **`ingestion.controller.ts`**:
  - `@Public()` decorator to bypass session auth guard.
  - `@UseGuards(ApiKeyGuard)` for API key authentication.
  - `POST /v1/events` — accepts `{ batch: Event[] }`, validates with Zod schema.
  - Body size limit: configure 1MB limit on this specific route.
  - Returns `202 Accepted` with `{ accepted: true, eventCount: N }`.
- [ ] **`ingestion.service.ts`**:
  - `submitBatch(projectId, organizationId, apiKeyId, events)`:
    - Store the batch in `EventBatch` table with status PENDING.
    - Update `ProjectApiKey.lastUsedAt`.
    - Return the count of accepted events.
- [ ] Register `IngestionModule` in `AppModule`.

### 3. API — Route configuration

- [ ] Ensure the ingestion endpoint has a separate body size limit (1MB) while dashboard routes keep the default.
- [ ] Ensure CORS allows SDK origins (the ingestion endpoint should accept requests from any origin since SDKs run on customer domains).

### 4. Unit tests (`apps/api/src/ingestion/`)

- [ ] `api-key.guard.spec.ts`:
  - Valid key → passes, attaches project/org to request.
  - Missing Authorization header → 401.
  - Invalid key format (not Bearer) → 401.
  - Non-existent key hash → 401.
  - Revoked key → 401.
  - Archived project → 403.
- [ ] `ingestion.service.spec.ts`:
  - `submitBatch` stores batch in DB, returns count.
  - `submitBatch` updates lastUsedAt on the API key.
- [ ] `ingestion.dto.spec.ts`:
  - Valid batch passes.
  - Empty batch rejected.
  - Batch over 100 events rejected.
  - Event missing eventId rejected.
  - Event missing eventName rejected.
  - Event missing timestamp rejected.
  - Event with invalid eventId format rejected.

### 5. E2E tests (`apps/api/test/`)

- [ ] `ingestion.e2e-spec.ts`:
  - Valid batch → 202 with `{ accepted: true, eventCount }`.
  - Missing Authorization → 401.
  - Invalid API key → 401.
  - Revoked API key → 401.
  - Archived project → 403.
  - Empty batch → 400.
  - Batch over limit → 400.
  - Malformed event (missing required fields) → 400.
  - Batch stored in `event_batches` table after 202.

### 6. SDK endpoint update

- [ ] Update the SDK's default endpoint from `https://api.userpulse.dev/v1/events` to match the actual API path. (This is a documentation note — the SDK's endpoint is configurable, and the actual URL depends on deployment. No code change needed unless the path structure changes.)

## Verification

```bash
# Unit tests
pnpm --filter api test

# E2E tests (requires PostgreSQL)
pnpm --filter api test:e2e

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Build
pnpm build

# Format
pnpm format:check
```

Manual verification:
- Use curl to POST a valid batch with a real API key and verify 202 response.
- Verify the batch appears in `event_batches` table.
- Verify invalid/revoked keys return 401.
- Verify archived project returns 403.

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

1. **MVP queue:** Using PostgreSQL `event_batches` table as the durable queue instead of SQS. This preserves the async contract (202 = accepted, not persisted in analytics) while working without AWS infrastructure. The table can be replaced by SQS when infrastructure is available.
2. **Body size limit:** 1MB per request. This accommodates ~100 events with reasonable property payloads.
3. **CORS:** The ingestion endpoint allows all origins (`*`) since customer SDKs run on their own domains.
4. **No rate limiting yet:** Rate limiting for the ingestion endpoint is deferred to a hardening pass (similar to auth rate limiting).
5. **lastUsedAt update:** Updated on each successful batch submission. This is a single-row update per request, acceptable for MVP volume.
