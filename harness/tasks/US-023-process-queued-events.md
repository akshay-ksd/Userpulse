# US-023 — Process queued events

- **Epic:** EP-05 Event Ingestion and Processing
- **Priority:** P0 (M3 — Event Ingestion Pipeline)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As the** platform, **I want** accepted event batches to be processed asynchronously, **so that** ingestion remains responsive during traffic spikes.

## Acceptance criteria

- [x] Accepted batches are processed in the background.
- [x] Events are inserted in bounded batches.
- [x] Transient failures are retried.
- [x] Partial failures do not incorrectly acknowledge unprocessed events.
- [x] Repeatedly failing messages reach a dead-letter queue.
- [x] Processing metrics are available.

## Story review

**Scope boundary:** This story adds asynchronous background processing of events from the PostgreSQL staging table (populated by US-021/US-022). The production architecture calls for SQS → Lambda → ClickHouse. For MVP, we implement the same processing pattern using `@nestjs/schedule` polling the PostgreSQL `events` table — this keeps the ingestion endpoint responsive (202 Accepted = queue acceptance) while events are processed in the background. ClickHouse persistence is out of scope — "processing" for MVP means marking events as processed and ready for analytics queries. The processing logic is isolated in a service that can be extracted to a Lambda consumer later.

**Key decisions:**

- **Processing framework (MVP):** Use `@nestjs/schedule` with a cron-based scheduled job that polls for unprocessed events. This avoids adding Redis (required by BullMQ) while still achieving background processing. The architecture's SQS pattern is preserved conceptually — the PostgreSQL `events` table with `processed = false` acts as the queue, and the scheduled job acts as the consumer.
- **Processing status model:** Replace the boolean `processed` field with a richer `processingStatus` enum to support retries and DLQ:
  - `PENDING` — accepted, awaiting processing (replaces `processed: false`)
  - `PROCESSING` — currently being processed (prevents double-pickup)
  - `PROCESSED` — successfully processed (replaces `processed: true`)
  - `FAILED` — transient failure, will be retried
  - `DLQ` — repeatedly failed, moved to dead-letter status for manual inspection
- **Bounded batches:** Process events in configurable batch sizes (default 500). Each poll cycle picks up at most one batch, processes it, and commits. This bounds memory usage and transaction size.
- **Retry strategy:** Events that fail processing get `retryCount` incremented and status set to `FAILED`. The processor picks up `FAILED` events after a backoff period (retryCount * 30 seconds). After `maxRetries` (default 5) failures, events are moved to `DLQ` status.
- **Partial failure handling:** Each event in a batch is processed individually. Successfully processed events are committed; failed events retain their `PENDING` or `FAILED` status. The processor does not use bulk operations that could mask individual failures.
- **Concurrency safety:** The processor uses a `SELECT ... FOR UPDATE SKIP LOCKED` pattern (via Prisma raw query) to claim events, preventing double-processing in multi-instance deployments.
- **Processing metrics:** Add a `GET /internal/metrics/processing` endpoint (protected by session auth) that returns queue depth, DLQ count, processing rate, and oldest pending event age. Also log metrics on each processing cycle.
- **Dead-letter queue:** Events with `processingStatus: 'DLQ'` are queryable via the metrics endpoint. No automatic purge — manual inspection and replay are deferred to operational tooling.

**Out of scope:**
- ClickHouse persistence (production analytics store)
- SQS integration (production queue)
- Separate Lambda event processor
- DLQ replay/purge tooling
- Rate limiting on ingestion
- Exponential backoff (simple linear backoff for MVP)

## Current codebase state (verified 2026-11-15)

- `apps/api/src/ingestion/ingestion.service.ts` — `submitBatch()` validates events via `EventValidationService`, stores valid/rejected events in PostgreSQL via `prisma.event.createMany()`. Events are stored with `processed: false` (pending). No background processing exists.
- `apps/api/src/ingestion/ingestion.module.ts` — Imports `PrismaModule`, provides `IngestionService`, `EventValidationService`, `IngestionController`.
- `apps/api/src/ingestion/event-validation.service.ts` — Per-event validation and normalization. Produces `VALID` or `REJECTED` status.
- `packages/database/prisma/schema.prisma` — `Event` model with `processed Boolean @default(false)`, `validationStatus String @default("VALID")`, `validationError String?`. Indexes on `(processed, ingestedAt)`, `(projectId, ingestedAt)`, `(eventId)`, `(projectId, validationStatus)`.
- `apps/api/src/app.module.ts` — Root module, imports `IngestionModule` among others. No `ScheduleModule` registered.
- `apps/api/package.json` — No `@nestjs/schedule` dependency yet.

## Dependencies

**Upstream (must be Done):**
- US-021 — Submit an event batch ✅ Done
- US-022 — Validate and normalize events ✅ Done

**Downstream (depends on this):**
- US-024 — Prevent duplicate events (will use processing status)
- US-025 — View event collection status (will query processing metrics)
- EP-07 — Product Analytics (needs processed events)

## Implementation subtasks

### 1. Database — Add processing status fields

- [ ] **1.1** Update `Event` model in `packages/database/prisma/schema.prisma`:
  - Replace `processed Boolean @default(false)` with `processingStatus String @default("PENDING")`
  - Add `retryCount Int @default(0)`
  - Add `processedAt DateTime? @db.Timestamptz(6)`
  - Add `processingError String?`
  - Update index: replace `@@index([processed, ingestedAt])` with `@@index([processingStatus, ingestedAt])` and add `@@index([processingStatus, retryCount])`
- [ ] **1.2** Create Prisma migration: `npx prisma migrate dev --name add_event_processing_status`
  - Migration must handle existing data: set `processingStatus = 'PENDING'` for `processed = false`, `'PROCESSED'` for `processed = true`
- [ ] **1.3** Update `IngestionService.submitBatch()` to use `processingStatus: 'PENDING'` instead of relying on `processed: false` default (default handles this, but be explicit in the valid events creation).

### 2. API — Install @nestjs/schedule

- [ ] **2.1** Install `@nestjs/schedule`: `pnpm --filter api add @nestjs/schedule`
- [ ] **2.2** Register `ScheduleModule.forRoot()` in `apps/api/src/app.module.ts`

### 3. API — EventProcessorService

Create `apps/api/src/event-processor/event-processor.service.ts`:

- [ ] **3.1** Create `EventProcessorModule` (`apps/api/src/event-processor/event-processor.module.ts`) importing `PrismaModule`, providing `EventProcessorService`.
- [ ] **3.2** Create `EventProcessorService` with:
  - Configuration constants: `BATCH_SIZE = 500`, `MAX_RETRIES = 5`, `RETRY_BACKOFF_SECONDS = 30`, `POLL_INTERVAL_MS = 5000`
  - `@Cron('*/5 * * * * *')` (every 5 seconds) or `@Interval(5000)` decorated `processNextBatch()` method
  - A processing lock (`private processing = false`) to prevent overlapping runs
- [ ] **3.3** Implement `claimBatch()`:
  - Use Prisma `$queryRaw` with `SELECT id FROM events WHERE processing_status = 'PENDING' AND validation_status = 'VALID' ORDER BY ingested_at ASC LIMIT $batchSize FOR UPDATE SKIP LOCKED`
  - Also pick up retryable events: `OR (processing_status = 'FAILED' AND retry_count < $maxRetries AND ingested_at < NOW() - INTERVAL '$backoff seconds')`
  - Return claimed event IDs
- [ ] **3.4** Implement `processEvent(eventId)`:
  - For MVP: mark event as `PROCESSED` with `processedAt = now()`
  - In production: this is where ClickHouse insert would go
  - On failure: increment `retryCount`, set status to `FAILED` or `DLQ` (if retryCount >= maxRetries), set `processingError`
- [ ] **3.5** Implement `processNextBatch()`:
  - Guard with `this.processing` lock
  - Call `claimBatch()` to get event IDs
  - Process each event individually within a transaction
  - Update status for each event (PROCESSED or FAILED/DLQ)
  - Log cycle metrics: batch size, success/fail counts, duration
- [ ] **3.6** Register `EventProcessorModule` in `apps/api/src/app.module.ts`

### 4. API — Processing metrics endpoint

Create `apps/api/src/event-processor/event-processor.controller.ts`:

- [ ] **4.1** `GET /internal/metrics/processing` — returns:
  ```json
  {
    "pending": 42,
    "processing": 0,
    "processed": 1500,
    "failed": 3,
    "dlq": 1,
    "oldestPendingAge": "2026-11-15T10:00:00Z",
    "processedLast5min": 250
  }
  ```
  Protected by global auth guard (session authentication).
- [ ] **4.2** Add `getMetrics()` to `EventProcessorService` that queries aggregate counts.

### 5. Tests — Unit tests

Create `apps/api/src/event-processor/event-processor.service.spec.ts`:

- [ ] **5.1** Test `processNextBatch()` — picks up PENDING events, marks as PROCESSED
- [ ] **5.2** Test `processNextBatch()` — respects batch size limit
- [ ] **5.3** Test `processNextBatch()` — skips REJECTED events (only processes VALID)
- [ ] **5.4** Test `processNextBatch()` — handles processing failure: increments retryCount, sets FAILED status
- [ ] **5.5** Test `processNextBatch()` — moves to DLQ after max retries
- [ ] **5.6** Test `processNextBatch()` — retries FAILED events after backoff period
- [ ] **5.7** Test `processNextBatch()` — concurrent processing lock prevents overlap
- [ ] **5.8** Test `getMetrics()` — returns correct aggregate counts

### 6. Tests — E2E tests

Create `apps/api/test/event-processor.e2e-spec.ts`:

- [ ] **6.1** Test: submitting events via ingestion → events appear as PENDING → processor marks them PROCESSED
- [ ] **6.2** Test: `GET /internal/metrics/processing` returns correct counts (requires auth)
- [ ] **6.3** Test: `GET /internal/metrics/processing` rejects unauthenticated requests (401)
- [ ] **6.4** Test: DLQ events are not re-processed

### 7. Update ingestion service

- [ ] **7.1** Update `IngestionService.submitBatch()` — ensure valid events are created with explicit `processingStatus: 'PENDING'`. Rejected events should be created with `processingStatus: 'REJECTED'` (they should never be processed).

## Verification

Run in order:

1. `pnpm --filter @userpulse/database build` — Prisma client generation
2. `pnpm --filter api test` — unit tests pass
3. `pnpm --filter api test:e2e` — e2e tests pass (requires PostgreSQL)
4. `pnpm lint` — no new lint errors
5. `pnpm typecheck` — no type errors
6. `pnpm build` — all packages build
7. `pnpm format:check` — formatting clean

## Definition of Done

- [ ] Background processor picks up PENDING events and marks them PROCESSED.
- [ ] Processing runs in bounded batches (default 500).
- [ ] Transient failures are retried up to MAX_RETRIES with backoff.
- [ ] Events exceeding MAX_RETRIES move to DLQ status.
- [ ] Partial failures do not affect successfully processed events in the same batch.
- [ ] Processing metrics are queryable via internal endpoint.
- [ ] Unit tests cover happy path, failure, retry, DLQ, concurrency, and metrics.
- [ ] E2E tests verify end-to-end flow where possible.
- [ ] Lint, typecheck, build, format all pass.
- [ ] progress.md and task file updated.

## Assumptions / open questions

- **No ClickHouse yet:** Processing for MVP means marking events as `PROCESSED` in PostgreSQL. The `processEvent()` method is the extension point for ClickHouse inserts.
- **No SQS:** PostgreSQL `events` table acts as the queue. `FOR UPDATE SKIP LOCKED` provides queue-like claim semantics.
- **No Redis:** Using `@nestjs/schedule` instead of BullMQ. Suitable for single-instance MVP; multi-instance requires distributed locking (deferred).
- **Poll interval:** 5 seconds is a reasonable default for MVP. Can be tuned via environment variable later.
- **Processing metrics endpoint:** Placed under `/internal/` prefix to signal it's not customer-facing. Could be moved to a separate admin API later.
