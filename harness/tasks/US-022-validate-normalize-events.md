# US-022 — Validate and normalize events

- **Epic:** EP-05 Event Ingestion and Processing
- **Priority:** P0 (M3 — Event Ingestion Pipeline)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15)
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

### Scope boundaries

- **In scope:** Adding an event validation and normalization layer to the ingestion service. When a batch is submitted via `POST /v1/events`, individual events are validated beyond the Zod schema (which currently handles structural validation). Valid events are normalized (field trimming, timestamp normalization, enforcing server-side tenant identifiers). Invalid events within a batch are isolated — the batch is still accepted (202), but invalid events are marked with validation errors in the stored batch metadata. Validation failure metrics are emitted via a counter logged at the service level.
- **Out of scope:** ClickHouse persistence (US-023), deduplication (US-024), event status UI (US-025), SQS integration, rate limiting.

### Key decisions

1. **Partial acceptance policy:** A batch is accepted as long as at least one event is valid. Invalid events are stored in a separate `invalidEvents` field on the `EventBatch` record (with error reasons but without sensitive content). If ALL events in a batch are invalid, the batch is still stored but marked with status `INVALID`. This gives the async processor (US-023) the information to skip invalid events and gives operators visibility.
2. **Tenant identifier enforcement:** `organizationId` and `projectId` are always derived from the API key (set by `ApiKeyGuard`), never from the event payload. If the payload contains `organizationId` or `projectId` fields, they are stripped during normalization.
3. **Normalization:** Event names are trimmed. Timestamps are validated as parseable ISO 8601 and stored as-is (the SDK sends ISO 8601). `anonymousId` and `userId` are trimmed. Properties keys/values are passed through. `sdkVersion`, `pageName`, `pagePath` are trimmed. `ingestedAt` timestamp is added server-side.
4. **Validation beyond Zod:** Zod handles structural validation (field presence, types). This story adds semantic validation: event name length/character constraints, timestamp reasonableness (not in far future), properties size limit (max 50 keys, max 8KB serialized), `anonymousId` or `userId` must be present (at least one identity).
5. **Observable failures:** A `Logger` instance logs a structured warning per batch with the count of invalid events and their error codes (never the event properties or user identifiers). The stored `EventBatch` record includes `validEventCount` and `invalidEventCount` fields.

### Edge cases

- All events in a batch are invalid → batch stored with status `INVALID`, response still 202 but with `validEventCount: 0`.
- Event with timestamp far in the future (>24h from now) → invalid.
- Event with timestamp very old (>30 days ago) → normalized with a warning flag, not rejected.
- Event with oversized properties → invalid.
- Event payload contains `organizationId` or `projectId` → stripped silently.
- Event with both `anonymousId` and `userId` empty/missing → invalid.

## Current codebase state

- **Ingestion module:** `apps/api/src/ingestion/` — `IngestionController`, `IngestionService`, `ApiKeyGuard`, `ingestion.dto.ts` with Zod schema.
- **Current validation:** Zod validates structural fields (eventId UUID, eventName non-empty max 200, timestamp datetime, optional fields). No semantic validation beyond structure.
- **Current flow:** Controller receives validated batch → `IngestionService.submitBatch()` stores the entire batch as JSONB in `EventBatch` table with status PENDING.
- **EventBatch model:** `id`, `organizationId`, `projectId`, `events` (Json), `eventCount`, `status` (PENDING/PROCESSING/DONE/FAILED), `createdAt`, `processedAt`.
- **Prisma schema:** `packages/database/prisma/schema.prisma` — EventBatch at line 162.

## Dependencies

- **Upstream:** US-021 (Submit event batch) — Done.
- **Downstream:** US-023 (Process queued events), US-024 (Prevent duplicates), US-025 (View event status).

## Implementation subtasks

### 1. Database — Add validation metadata to EventBatch (`packages/database`)

- [x] Add fields to `EventBatch` model in Prisma schema:
  - `validEventCount Int?` — count of events that passed validation.
  - `invalidEventCount Int?` — count of events that failed validation.
  - `validEvents Json?` — normalized valid events array.
  - `invalidEvents Json?` — array of `{ eventId, errors: string[] }` (no sensitive content).
- [x] Add `INVALID` value to `EventBatchStatus` enum (batches where all events fail validation).
- [x] Generate and apply Prisma migration.

### 2. API — Event validation service (`apps/api/src/ingestion/`)

- [x] Create `event-validator.ts` with an `EventValidator` class (plain, no DI needed — pure logic):
  - `validateAndNormalize(events: EventDto[], organizationId: string, projectId: string): { valid: NormalizedEvent[]; invalid: InvalidEvent[] }`
  - For each event:
    - **Strip tenant fields:** Remove `organizationId`, `projectId` from event if present.
    - **Trim strings:** `eventName`, `anonymousId`, `userId`, `pageName`, `pagePath`, `sdkVersion`.
    - **Validate event name:** Non-empty after trim, max 200 chars, only printable characters (no control chars).
    - **Validate timestamp:** Parseable by `new Date()`, not in the future by more than 24 hours.
    - **Validate identity:** At least one of `anonymousId` or `userId` must be a non-empty string after trim.
    - **Validate properties:** If present, max 50 keys, serialized JSON max 8192 bytes.
    - **Add server context:** `organizationId`, `projectId`, `ingestedAt` (ISO 8601 server timestamp).
  - Return valid (normalized) and invalid (with error codes) arrays.
- [x] Define `NormalizedEvent` type extending `EventDto` with `organizationId`, `projectId`, `ingestedAt`.
- [x] Define `InvalidEvent` type: `{ eventId: string; errors: string[] }`.

### 3. API — Update IngestionService (`apps/api/src/ingestion/`)

- [x] Update `IngestionService.submitBatch()`:
  - Call `EventValidator.validateAndNormalize()` on the incoming events.
  - Store both `validEvents` and `invalidEvents` in the `EventBatch` record.
  - Set `validEventCount` and `invalidEventCount`.
  - Set `events` to the full original batch (for audit/replay).
  - Set status to `INVALID` if all events are invalid, else `PENDING`.
  - Return `{ eventCount, validEventCount, invalidEventCount }`.
- [x] Add a `Logger` instance. Log a warning when `invalidEventCount > 0` with the count and batch ID (no sensitive data).

### 4. API — Update IngestionController (`apps/api/src/ingestion/`)

- [x] Update the response shape to include `validEventCount` and `invalidEventCount`:
  ```
  { accepted: true, eventCount: N, validEventCount: N, invalidEventCount: N }
  ```

### 5. Unit tests — EventValidator (`apps/api/src/ingestion/`)

- [x] `event-validator.spec.ts`:
  - Valid event passes and is normalized with server context.
  - Tenant fields (`organizationId`, `projectId`) are stripped from payload.
  - Event name with whitespace is trimmed.
  - Event name with control characters is rejected.
  - Empty event name after trim is rejected.
  - Timestamp in far future (>24h) is rejected.
  - Valid old timestamp passes.
  - Missing both `anonymousId` and `userId` is rejected.
  - Having only `anonymousId` passes.
  - Having only `userId` passes.
  - Properties with >50 keys is rejected.
  - Properties over 8KB is rejected.
  - `ingestedAt` is added to normalized events.
  - Mixed batch: some valid, some invalid — correct split.

### 6. Unit tests — Updated IngestionService (`apps/api/src/ingestion/`)

- [x] Update `ingestion.service.spec.ts`:
  - Test that `submitBatch` calls `EventValidator.validateAndNormalize()`.
  - Test that valid/invalid counts are stored.
  - Test that status is `INVALID` when all events are invalid.
  - Test that status is `PENDING` when at least one event is valid.
  - Test that a warning is logged when invalid events exist.

### 7. Unit tests — Updated response shape

- [x] Update or add test for controller response including `validEventCount` and `invalidEventCount`.

## Verification

```bash
# Unit tests
pnpm --filter api test

# Lint
pnpm lint

# Typecheck
pnpm typecheck

# Build
pnpm build

# Format
pnpm format:check
```

### Results (2026-11-15)

- `pnpm --filter api test` — 122 passed (21 new: 17 validator, 4 service).
- `pnpm --filter api test:e2e` — 123 passed against local PostgreSQL 16 (3 new ingestion cases; migration `20261115110000_event_batch_validation` applied with `prisma migrate deploy`).
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format:check` — all pass (pre-existing lint warnings only).

### Deviations from the plan

- The validator is an exported function `validateAndNormalize()` rather than a class (no state to hold).
- The policy is documented in `harness/architecture.md` §5.2 ("Event validation and isolation policy").
- The response shape is covered by the e2e suite rather than a separate controller unit test.
- Timestamps are normalized to UTC ISO 8601; blank optional strings are dropped rather than stored empty.
- No "old event" warning flag was added: old timestamps are simply accepted (nothing consumes such a flag yet).

## Definition of Done

- [x] The implementation meets the requested behavior and acceptance criteria.
- [x] The solution follows the approved architecture and existing project conventions.
- [x] Changes are limited to the task and necessary related updates.
- [x] Relevant tests have been added or updated.
- [x] Relevant tests and checks have been executed, or unrun checks are explicitly disclosed.
- [x] Authorization, tenant isolation, privacy, and security implications have been considered.
- [x] API, event, database, and documentation contracts are updated when required.
- [x] No unrelated changes or destructive operations have been introduced.
- [x] The final report accurately describes changes, verification, and remaining limitations.

## Assumptions / open questions

1. **Partial acceptance:** Batches with some invalid events are still accepted (202). The response includes counts so the SDK/caller knows how many events were valid. This avoids dropping valid events because of one bad event in a batch.
2. **Properties size limit:** 8KB per event's properties and 50 keys max is a reasonable MVP limit. Can be adjusted based on real usage patterns.
3. **Timestamp window:** Events >24h in the future are rejected. Events up to 30 days old are accepted (SDKs may retry old batches). Beyond 30 days could be flagged but is accepted for MVP.
4. **No ClickHouse interaction:** This story validates and normalizes events in the PostgreSQL queue. ClickHouse insertion happens in US-023.
5. **Original events preserved:** The original `events` JSON is kept in the batch for audit/replay. `validEvents` contains the normalized versions ready for processing.
