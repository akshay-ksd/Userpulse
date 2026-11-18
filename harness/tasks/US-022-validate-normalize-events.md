# US-022 — Validate and normalize events

- **Epic:** EP-05 Event Ingestion and Processing
- **Priority:** P0 (M3 — Event Ingestion Pipeline)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As the** platform, **I want** incoming events to be validated and normalized, **so that** analytics receives consistent records.

## Acceptance criteria

- [x] Required fields and formats are validated.
- [x] Invalid events follow a documented rejection or isolation policy.
- [x] Tenant identifiers cannot be overridden by untrusted payload values.
- [x] Normalized events retain required context.
- [x] Validation failures are observable without logging sensitive content.

## Story review

**Scope boundary:** This story adds a validation-and-normalization layer that processes events from the PostgreSQL staging table (populated by US-021) and produces validated, normalized records ready for downstream analytical storage. It does NOT move events to ClickHouse (US-023 scope) or handle deduplication (US-024 scope). It runs as an in-process service in the existing API app for MVP.

**Key decisions:**

- **Processing model (MVP):** Since SQS and a separate Lambda processor are not available in the dev environment, implement a `ValidationService` that runs in the same API process. The ingestion flow calls validation inline during `submitBatch()` before persisting events. Invalid events are stored with a `validationStatus` field rather than silently dropped — this supports observability and debugging. In production this logic moves into the Event Processor Lambda.
- **Validation approach — two layers:**
  1. **Ingestion-time Zod validation (US-021, already exists):** Rejects entire batches with malformed structure (missing eventId, bad timestamp format, etc.) with 400. This stays as-is.
  2. **Per-event normalization and validation (this story):** Operates on structurally valid events. Normalizes field values (trimming, casing), validates semantic constraints (event name patterns, property size limits), and enriches with server-derived context. Invalid individual events within an otherwise valid batch are marked with `validationStatus: 'REJECTED'` and a `validationError` message, rather than failing the whole batch.
- **Tenant identifier protection:** `organizationId` and `projectId` are derived server-side from the API key in `ApiKeyGuard` (US-021). The normalization layer must NOT trust or use any `organizationId`/`projectId` values that may appear in event `properties`. This is already the case in the current `IngestionService.submitBatch()` — it uses the guard-derived values. This story adds an explicit strip of any `organizationId`/`projectId` from event `properties` to prevent accidental leakage into analytics.
- **Normalization rules:**
  - `eventName`: Trim whitespace, enforce max length (500 chars, already in Zod), reject empty after trim.
  - `anonymousId` / `userId`: Trim whitespace, enforce max length (200 chars).
  - `timestamp`: Parse to UTC `DateTime`, reject future timestamps > 1 hour ahead, reject timestamps > 1 year old.
  - `properties`: Strip `organizationId`, `projectId`, `apiKey` keys. Limit total serialized size to 32KB. Limit nesting depth to 5 levels.
  - `sdkVersion`: Trim, enforce max length (50 chars).
- **Validation status tracking:** Add `validationStatus` enum (`VALID`, `REJECTED`) and `validationError` nullable string to the `Event` model. Default `VALID`. This enables US-025 (event collection status) to show validation error rates.
- **Observability:** Log validation rejection counts per project (not event content). Expose a `validationErrors` count in the batch response alongside `accepted`.
- **Response shape update:** `POST /v1/events` response changes from `{ accepted: N }` to `{ accepted: N, rejected: N, errors?: Array<{ index: number, error: string }> }`. The SDK already ignores the response body (fire-and-forget), so this is backward compatible.

**Out of scope:**
- Moving events to ClickHouse (US-023)
- Deduplication logic (US-024)
- Event collection status UI (US-025)
- SQS integration (production infrastructure)
- Rate limiting

## Current codebase state (verified 2026-11-15)

- `apps/api/src/ingestion/ingestion.service.ts` — `submitBatch()` accepts pre-validated events from controller, maps them to `prisma.event.createMany()`. No per-event normalization or validation beyond Zod schema.
- `apps/api/src/ingestion/submit-events.dto.ts` — Zod schema validates structure: `eventId` (UUID), `eventName` (1–500), `timestamp` (datetime), optional `anonymousId` (max 200), `userId` (max 200), `properties` (record), `sdkVersion` (max 50).
- `apps/api/src/ingestion/api-key.guard.ts` — Derives `organizationId`, `projectId`, `apiKeyId` from Bearer token. Checks revocation and project status.
- `apps/api/src/ingestion/ingestion.controller.ts` — `POST /v1/events`, 202 Accepted, delegates to `IngestionService`.
- `packages/database/prisma/schema.prisma` — `Event` model with `processed: Boolean @default(false)`. No `validationStatus` or `validationError` fields.
- `apps/api/src/ingestion/ingestion.service.spec.ts` — 5 unit tests for `submitBatch`.
- `apps/api/src/ingestion/api-key.guard.spec.ts` — 7 unit tests for the guard.

## Dependencies

- **Upstream:** US-021 (Done — ingestion endpoint and Event staging table exist).
- **Downstream:** US-023 (process queued events — will consume only `validationStatus: 'VALID'` events), US-024 (deduplication), US-025 (event status UI — will use `validationStatus` for error rates).

## Implementation subtasks

### 1. Database — Add validation fields to Event model

- [ ] Add to `Event` model in `packages/database/prisma/schema.prisma`:
  ```prisma
  validationStatus  String   @default("VALID")
  validationError   String?
  ```
- [ ] Add index `@@index([projectId, validationStatus])` for filtering by validation status.
- [ ] Run migration: `npx prisma migrate dev --name add_event_validation_fields`.

### 2. API — Create EventValidationService

- [ ] Create `apps/api/src/ingestion/event-validation.service.ts`:
  - `@Injectable()` class `EventValidationService`.
  - Method `validateAndNormalize(event: EventDto, context: { organizationId: string; projectId: string }): { normalized: NormalizedEvent; status: 'VALID' | 'REJECTED'; error?: string }`.
  - Normalization:
    - `eventName`: `trim()`. Reject if empty after trim.
    - `anonymousId`: `trim()` if present. Set to `null` if empty after trim.
    - `userId`: `trim()` if present. Set to `null` if empty after trim.
    - `sdkVersion`: `trim()` if present.
    - `timestamp`: Parse with `new Date()`. Reject if > 1 hour in the future (`Date.now() + 3_600_000`). Reject if > 1 year old (`Date.now() - 365 * 86_400_000`).
    - `properties`: If present, strip keys `organizationId`, `projectId`, `apiKey`, `apikey`, `api_key`. Reject if `JSON.stringify(properties).length > 32768`. Reject if nesting depth > 5.
  - Export `NormalizedEvent` type (same as `EventDto` but with normalized values).

- [ ] Create `apps/api/src/ingestion/event-validation.service.spec.ts`:
  - Test: valid event passes through with trimmed values.
  - Test: eventName with only whitespace is rejected.
  - Test: future timestamp (> 1 hour) is rejected.
  - Test: old timestamp (> 1 year) is rejected.
  - Test: oversized properties are rejected.
  - Test: deeply nested properties are rejected.
  - Test: `organizationId` / `projectId` / `apiKey` stripped from properties.
  - Test: empty anonymousId after trim becomes null.
  - Test: valid event with no optional fields passes.

### 3. API — Update IngestionService to use validation

- [ ] Update `apps/api/src/ingestion/ingestion.module.ts` — add `EventValidationService` to providers.
- [ ] Update `apps/api/src/ingestion/ingestion.service.ts`:
  - Inject `EventValidationService`.
  - In `submitBatch()`, run each event through `validateAndNormalize()`.
  - Split events into valid and rejected arrays.
  - `createMany()` for valid events with `validationStatus: 'VALID'`.
  - `createMany()` for rejected events with `validationStatus: 'REJECTED'` and `validationError`.
  - Return `{ accepted: validCount, rejected: rejectedCount, errors: rejectedDetails }`.
- [ ] Update `BatchResult` type to include `rejected: number` and optional `errors` array.

### 4. API — Update response type

- [ ] Update `apps/api/src/ingestion/ingestion.service.ts` — `BatchResult` interface:
  ```typescript
  export interface BatchResult {
    accepted: number;
    rejected: number;
    errors?: Array<{ index: number; error: string }>;
  }
  ```
- [ ] Controller already returns `BatchResult`, no change needed there.

### 5. Tests — Unit tests for IngestionService with validation

- [ ] Update `apps/api/src/ingestion/ingestion.service.spec.ts`:
  - Test: batch with all valid events — all accepted, rejected = 0.
  - Test: batch with some invalid events — valid events accepted, invalid rejected with errors.
  - Test: batch with all invalid events — accepted = 0, all rejected.
  - Test: tenant IDs stripped from properties.
  - Test: normalized values (trimmed) are stored correctly.

### 6. Tests — E2E tests

- [ ] Add e2e tests in `apps/api/test/ingestion-validation.e2e-spec.ts`:
  - Test: valid batch returns 202 with `accepted: N, rejected: 0`.
  - Test: batch with invalid timestamp returns 202 with partial rejection.
  - Test: properties with tenant IDs are stripped (verify via DB).
  - Test: oversized properties event is rejected.
  - Test: empty eventName after trim is rejected.
  - Test: response includes error details for rejected events.

### 7. Observability — Logging

- [ ] In `IngestionService.submitBatch()`, add a `Logger` instance.
- [ ] Log at `warn` level when events are rejected: `"Event validation: ${rejectedCount} rejected in batch for project ${projectId}"`. Do NOT log event content or properties.

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
- Send a valid batch via curl → 202, `accepted: N, rejected: 0`.
- Send a batch with a future-timestamp event → 202, partial rejection with error detail.
- Send a batch with oversized properties → 202, that event rejected.
- Verify `organizationId`/`projectId` stripped from stored event properties.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] Per-event validation and normalization logic is implemented and tested.
- [ ] Invalid events are isolated (stored with `REJECTED` status), not silently dropped.
- [ ] Tenant identifiers cannot be injected via event properties.
- [ ] Validation failures are logged without sensitive content.
- [ ] Unit tests pass.
- [ ] E2E tests written (run if PostgreSQL available).
- [ ] Lint, typecheck, and build pass.
- [ ] Response shape is backward compatible with SDK.
- [ ] Progress.md updated.

## Assumptions / open questions

- **Assumption:** Rejected events are stored in the same table with `validationStatus: 'REJECTED'` for observability. They will be excluded from downstream processing (US-023). An alternative would be a separate `rejected_events` table, but a status field is simpler and sufficient for MVP.
- **Assumption:** The 202 response code stays even when some events are rejected — the batch was accepted for processing, and partial rejection is reported in the body. This matches the "queue acceptance" semantics.
- **Assumption:** Property size limit of 32KB and nesting depth of 5 are reasonable defaults. These can be made configurable later.
- **Decision:** Future timestamp tolerance is 1 hour (clock skew), and max age is 1 year. Events outside this range are rejected rather than silently adjusted.
