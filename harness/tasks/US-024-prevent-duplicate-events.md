# US-024 — Prevent duplicate events

- **Epic:** EP-05 Event Ingestion and Processing
- **Priority:** P0 (M3 — Event Ingestion Pipeline)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** product analyst, **I want** duplicate event deliveries to be handled, **so that** metrics are not inflated by retries.

## Acceptance criteria

- [x] Events have stable identifiers suitable for deduplication.
- [x] The deduplication strategy is documented.
- [x] Reprocessing the same event does not increase validated test counts.
- [x] Retry and replay scenarios are tested.
- [x] Guarantees and limitations are documented.

## Story review

**Scope boundary:** This story adds deduplication so that duplicate event submissions (from SDK retries, network replays, or manual replays) do not inflate metrics. The SDK already generates a stable `eventId` (UUID) per event in `track()` and `page()`. Retried flushes resend the same events with the same `eventId`. The server must detect and skip duplicates at ingestion time.

**Key decisions:**

- **Deduplication key:** `(projectId, eventId)` — the SDK generates a `crypto.randomUUID()` per event. When a flush fails and events are requeued, the same `eventId` is resent. This makes `eventId` stable across retries within the same SDK instance. Cross-project collisions don't matter since events are always scoped to a project.
- **Deduplication strategy:** Add a unique constraint on `(projectId, eventId)` in the database. On `createMany`, use `skipDuplicates: true` (Prisma's built-in for `INSERT ... ON CONFLICT DO NOTHING`). Duplicates are silently skipped — no error returned to the SDK.
- **Response shape:** The response's `accepted` count reflects events actually inserted (excluding duplicates). A new `duplicates` field reports how many were skipped. This is backward-compatible — the SDK ignores the response body.
- **Deduplication window:** The constraint is permanent (as long as the event row exists). In production, a time-bounded deduplication window (e.g., 24h) could be implemented, but for MVP the database constraint suffices and is simpler.
- **Event processor:** No changes needed — the processor already works on individual event rows by `id` (the database PK). Deduplication happens at ingestion time, before rows exist.
- **Documentation:** Add inline comments in the ingestion service and a section in the SDK README explaining the deduplication guarantee.

**Out of scope:**
- Cross-project deduplication (events are always project-scoped)
- Time-bounded deduplication windows (full uniqueness constraint for MVP)
- Deduplication in ClickHouse (production analytics store)
- Replaying DLQ events (separate operational tooling)

## Current codebase state (verified 2026-11-15)

- `packages/database/prisma/schema.prisma` — `Event` model has `eventId String` field with `@@index([eventId])` but no uniqueness constraint. The `id` field (UUID, auto-generated) is the PK.
- `apps/api/src/ingestion/ingestion.service.ts` — `submitBatch()` uses `prisma.event.createMany()` for both valid and rejected events. No duplicate detection.
- `apps/api/src/ingestion/submit-events.dto.ts` — `eventId` is validated as `z.string().uuid()`.
- `packages/sdk/src/client.ts` — `track()` and `page()` generate `eventId: crypto.randomUUID()` per event. When `flush()` fails, events are requeued with the same `eventId` via `requeueEvents()`.
- `apps/api/src/event-processor/event-processor.service.ts` — Processes events by database `id` (PK). No deduplication concern since duplicates would be separate rows.
- `apps/api/src/ingestion/event-validation.service.ts` — Validates events but doesn't check for duplicates.

## Dependencies

**Upstream (must be Done):**
- US-021 — Submit an event batch (Done) — ingestion endpoint
- US-022 — Validate and normalize events (Done) — validation pipeline
- US-023 — Process queued events (Done) — processor uses individual event rows

**Downstream (depends on this):**
- US-025 — View event collection status — will display event counts that should be accurate (no inflation from duplicates)
- EP-07+ analytics stories — all analytics depend on non-inflated event counts

## Implementation subtasks

### 1. Database — Add unique constraint on (projectId, eventId)

- [x] **1.1** Create Prisma migration to add a unique constraint on `(projectId, eventId)` in the `events` table.
  - File: `packages/database/prisma/schema.prisma`
  - Change: Replace `@@index([eventId])` with `@@unique([projectId, eventId])` on the `Event` model. The unique constraint implicitly creates an index, so the separate index is redundant.
  - Migration name: `20261115160000_add_event_dedup_constraint`
  - Run: `pnpm --filter @userpulse/database prisma migrate dev --name add_event_dedup_constraint`
  - Note: If existing data has duplicates (unlikely in dev), the migration will fail. Handle with a pre-migration cleanup step if needed.

### 2. API — Update ingestion service for deduplication

- [x] **2.1** Update `IngestionService.submitBatch()` to use `skipDuplicates: true` in `createMany()`.
  - File: `apps/api/src/ingestion/ingestion.service.ts`
  - Change: Add `skipDuplicates: true` to both `prisma.event.createMany()` calls.
  - Prisma's `createMany` with `skipDuplicates: true` uses `INSERT ... ON CONFLICT DO NOTHING`, which silently skips rows that violate unique constraints.

- [x] **2.2** Update `BatchResult` to track duplicate counts and return accurate accepted count.
  - File: `apps/api/src/ingestion/ingestion.service.ts`
  - Change `BatchResult` interface: add `duplicates: number` field.
  - After `createMany`, use the returned `count` to determine how many were actually inserted vs. skipped.
  - `accepted = createManyResult.count` (actual inserts), `duplicates = validData.length - createManyResult.count`.
  - Response shape: `{ accepted: N, rejected: M, duplicates: D, errors?: [...] }`.

- [x] **2.3** Add a debug log when duplicates are detected.
  - File: `apps/api/src/ingestion/ingestion.service.ts`
  - When `duplicates > 0`, log at debug level: `"Event deduplication: {duplicates} duplicate(s) skipped in batch for project {projectId}"`.

### 3. Tests — Unit tests

- [x] **3.1** Update `IngestionService` unit tests for deduplication.
  - File: `apps/api/src/ingestion/ingestion.service.spec.ts`
  - Add test: `skipDuplicates: true` is passed to `createMany`.
  - Add test: `BatchResult.duplicates` is calculated correctly from `createMany` return count.
  - Add test: response includes `duplicates` field.

- [x] **3.2** Add `EventValidationService` test confirming `eventId` passes through unchanged.
  - File: `apps/api/src/ingestion/event-validation.service.spec.ts`
  - Verify that `eventId` from input appears in normalized output unchanged (already implicit, but worth explicit coverage).

### 4. Tests — E2E tests

- [x] **4.1** Write e2e tests for duplicate event handling.
  - File: `apps/api/test/ingestion.e2e-spec.ts` (or new `deduplication.e2e-spec.ts`)
  - Test: Submit the same batch twice → second submission returns `duplicates > 0`, total events in DB equals one copy.
  - Test: Submit batch with duplicate `eventId` within the same batch → only one row per `eventId` stored.
  - Test: Different projects can have events with the same `eventId` (cross-project uniqueness not enforced).
  - Test: Resubmission after processing (event already PROCESSED) still deduplicates (constraint is on `projectId, eventId`, not status).

### 5. Documentation

- [x] **5.1** Add deduplication documentation to SDK README.
  - File: `packages/sdk/README.md`
  - Add section: "Event Deduplication" explaining:
    - Each event gets a unique `eventId` at creation time.
    - If a flush fails and events are retried, the same `eventId` is resent.
    - The server deduplicates by `(projectId, eventId)` — duplicate submissions are silently skipped.
    - Guarantees: exactly-once storage per `eventId` within a project.
    - Limitations: `eventId` is generated client-side; if the SDK is re-initialized (page reload without localStorage), new UUIDs are generated for any events not yet flushed.

- [x] **5.2** Add inline documentation in ingestion service.
  - File: `apps/api/src/ingestion/ingestion.service.ts`
  - Brief comment on the `skipDuplicates` behavior and the deduplication strategy.

## Verification

Run these commands after implementation:

1. `pnpm --filter @userpulse/database prisma migrate dev` — migration applies cleanly
2. `pnpm --filter api test` — all unit tests pass (including new dedup tests)
3. `pnpm --filter api test:e2e` — all e2e tests pass (if PostgreSQL available)
4. `pnpm lint` — no new warnings
5. `pnpm typecheck` — passes
6. `pnpm build` — all packages build
7. `pnpm format:check` — passes

## Definition of Done

- [x] Unique constraint on `(projectId, eventId)` exists in the database.
- [x] `createMany` uses `skipDuplicates: true`.
- [x] Response includes `duplicates` count.
- [x] Unit tests verify deduplication behavior.
- [x] E2E tests cover retry and replay scenarios.
- [x] Deduplication strategy is documented in SDK README and ingestion service.
- [x] All existing tests continue to pass.
- [x] Lint, typecheck, and build pass.

## Assumptions / open questions

- **Assumption:** No duplicate `eventId` values exist in the current dev database (table is likely empty or has unique IDs from testing). If duplicates exist, a cleanup step before migration is needed.
- **Assumption:** `skipDuplicates: true` with `createMany` is sufficient for MVP. In production with high concurrency, the `ON CONFLICT DO NOTHING` approach may need to be paired with a time-bounded deduplication cache for performance.
- **Decision:** Deduplication at ingestion time (before storage) rather than at processing time (before analytics). This is simpler and prevents duplicate rows from consuming storage.
