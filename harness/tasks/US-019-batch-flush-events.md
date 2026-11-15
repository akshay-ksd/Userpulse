# US-019 — Batch and flush events

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Project Setup and Tracking SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** developer, **I want** the SDK to batch and flush events, **so that** tracking is efficient and does not create a request for every action.

## Acceptance criteria

- [x] Events are buffered in a bounded queue.
- [x] The SDK flushes when configured limits or conditions are met.
- [x] A developer can request an explicit flush.
- [x] Queue limits prevent unbounded memory growth.
- [x] Network failures do not block the customer application.

## Story review

The SDK already has a bounded event queue (`maxQueueSize`, default 100) and a `flushInterval` config (default 30s) — but no actual flush mechanism, no HTTP transport, and no `flush()` method. This story adds:

1. **`flush()` method** — drains the queue and sends events via HTTP POST to the configured endpoint.
2. **Automatic periodic flushing** — a timer fires every `flushInterval` ms.
3. **HTTP transport** — POST to `config.endpoint` with `Authorization: Bearer <apiKey>`, JSON body `{ batch: [...events] }`.
4. **Error handling** — network failures logged (debug mode), never throw, never block the app.
5. **`beforeunload` / `visibilitychange` flush** — best-effort flush on page unload (browser only).
6. **`destroy()` method** — stops the timer and flushes remaining events.

**Scope boundaries:**
- No retry logic — events are fire-and-forget for MVP. Failed batches are dropped.
- No persistent queue (IndexedDB/localStorage) — in-memory only.
- No compression — plain JSON.
- The ingestion endpoint (US-021) doesn't exist yet; the SDK sends to `config.endpoint` regardless.
- `navigator.sendBeacon` used for unload flushes when available (fire-and-forget).

## Current codebase state (verified 2026-11-15)

- `packages/sdk/src/client.ts` — `UserpulseClient` class with `track()`, `identify()`, `page()`, `reset()`. Queue is `readonly queue: UserpulseEvent[]`. No flush logic, no timer, no HTTP calls.
- `packages/sdk/src/types.ts` — `UserpulseInstance` interface, `UserpulseConfig`, `ResolvedConfig`, `UserpulseEvent`. No `flush()` or `destroy()` on the interface.
- `packages/sdk/src/index.ts` — Module-level `init()`, `getClient()`, and delegating `track()`, `identify()`, `page()`, `reset()`. No `flush()` or `destroy()` exports.
- `packages/sdk/src/version.ts` — `SDK_VERSION = '0.1.0'`.
- `packages/sdk/src/__tests__/` — test files for init, track, identify, page, reset. Using Vitest.
- Config: `flushInterval` (default 30000) and `maxQueueSize` (default 100) already in config types.
- No runtime dependencies in `packages/sdk/package.json`.

## Dependencies

- **Upstream:** US-014 (init), US-015 (track), US-016 (identify), US-017 (page), US-018 (reset) — all Done.
- **Downstream:** US-020 (consent), US-021 (event ingestion endpoint) — will consume events sent by flush.

## Implementation subtasks

### 1. Types (`packages/sdk/src/types.ts`)

- [x] Add `flush(): Promise<void>` to `UserpulseInstance`.
- [x] Add `destroy(): void` to `UserpulseInstance`.

### 2. Client (`packages/sdk/src/client.ts`)

- [x] Add a private `flushTimer: ReturnType<typeof setInterval> | null` field.
- [x] Start the flush timer in the constructor: `setInterval(() => this.flush(), this.config.flushInterval)`.
- [x] Implement `async flush(): Promise<void>`.
- [x] Implement `destroy(): void`.
- [x] Add browser unload handling (visibilitychange + sendBeacon).
- [x] Update `track()` and `page()` to check `destroyed` flag and return early if set.

### 3. Module exports (`packages/sdk/src/index.ts`)

- [x] Add `flush()` top-level export that delegates to `currentClient.flush()`.
- [x] Add `destroy()` top-level export that delegates to `currentClient.destroy()`.
- [x] In `init()`, call `destroy()` on the previous client if re-initializing.

### 4. Tests (`packages/sdk/src/__tests__/flush.test.ts`)

- [x] Test: `flush()` sends queued events via fetch and clears the queue.
- [x] Test: `flush()` with empty queue does not call fetch.
- [x] Test: `flush()` sends correct payload shape `{ batch: [...] }`.
- [x] Test: `flush()` sends correct headers (Content-Type, Authorization).
- [x] Test: `flush()` catches network errors without throwing.
- [x] Test: `flush()` logs debug warning on network failure when debug is true.
- [x] Test: automatic flush fires after flushInterval.
- [x] Test: `destroy()` clears the timer.
- [x] Test: `destroy()` triggers a flush.
- [x] Test: tracking after `destroy()` is ignored.
- [x] Test: queue is bounded (already tested, verify still works).
- [x] Test: top-level `flush()` delegates to client.
- [x] Test: top-level `destroy()` delegates to client.
- [x] Test: top-level `flush()` warns when not initialized.

### 5. README (`packages/sdk/README.md`)

- [x] Document `flush()` — explicit flush, returns a Promise.
- [x] Document `destroy()` — cleanup method.
- [x] Document automatic flushing behavior (interval, page unload).
- [x] Document `flushInterval` config option.

## Verification

1. `pnpm --filter @userpulse/sdk test` — all tests pass.
2. `pnpm --filter @userpulse/sdk build` — produces dist.
3. `pnpm typecheck` — no errors.
4. `pnpm lint` — no new warnings.
5. `pnpm build` — full workspace builds.
6. `pnpm format:check` — pass.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Implementation follows existing SDK patterns and conventions.
- [x] Changes are limited to SDK package files.
- [x] Unit tests cover flush, destroy, auto-flush, error handling.
- [x] All checks pass.
- [x] README is updated.
- [x] progress.md and task file are updated.

## Assumptions / open questions

- **No retry**: failed flushes drop events. Retry/persistence is a post-MVP enhancement.
- **fetch() availability**: assumed (browser + Node 18+). No polyfill.
- **sendBeacon for unload**: best-effort, not guaranteed. Falls back to fetch if sendBeacon is unavailable.
- **Ingestion endpoint**: SDK sends to `config.endpoint` regardless of whether the server exists. US-021 will build the server side.
