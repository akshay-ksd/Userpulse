# US-019 — Batch and flush events

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Event Collection)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15)
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

The SDK already has a bounded event queue (`this.queue`) with `maxQueueSize` (default 100) and `flushInterval` config (default 30s), but no flush logic or HTTP transport exists. This story adds:

- **`flush()` method** — sends queued events as a batch POST to the configured endpoint.
- **Auto-flush on timer** — periodic flush every `flushInterval` ms after init.
- **Network transport** — `fetch()` POST with JSON body, API key in header.
- **Error handling** — network failures caught silently; events stay in queue for retry on next flush.
- **Browser lifecycle hooks** — `beforeunload`/`visibilitychange` trigger flush for page exits.
- **`destroy()` method** — stops the timer and flushes remaining events.

**Scope boundaries:**
- The ingestion endpoint (`/v1/events`) doesn't exist yet (US-021). The SDK should POST to the configured endpoint; it will work once the server-side exists.
- No retry with exponential backoff — keep it simple. Failed events stay in queue and are retried on next flush.
- No `navigator.sendBeacon` — `fetch` with `keepalive` is sufficient and simpler.
- Queue is in-memory only; no persistence across page loads.

## Current codebase state

- `packages/sdk/src/client.ts` — `UserpulseClient` with `queue`, `track()`, `page()`, `identify()`, `reset()`. No `flush()`, no timer, no HTTP.
- `packages/sdk/src/types.ts` — `UserpulseInstance` interface, `UserpulseEvent`, configs.
- `packages/sdk/src/index.ts` — module-level singleton, top-level exports.
- `packages/sdk/src/__tests__/` — 56 tests across 4 files.
- Config: `endpoint` (default `https://api.userpulse.dev/v1/events`), `flushInterval` (30000), `maxQueueSize` (100).

## Dependencies

- Upstream: US-014 (init), US-015 (track), US-016 (identify), US-017 (page) — all Done.
- Downstream: US-021 (server-side ingestion endpoint) will consume what this SDK sends.

## Implementation subtasks

### 1. SDK types (`packages/sdk/src/types.ts`)

- [ ] Add `flush(): Promise<void>` to `UserpulseInstance` interface.
- [ ] Add `destroy(): void` to `UserpulseInstance` interface.

### 2. SDK client (`packages/sdk/src/client.ts`)

- [ ] Add `flush()` method:
  - Drain `this.queue` into a local array (clear queue immediately so new events can queue during flush).
  - If batch is empty, return immediately.
  - POST to `this.config.endpoint` with `{ batch: events }` body.
  - Headers: `Content-Type: application/json`, `Authorization: Bearer ${this.config.apiKey}`.
  - On success (2xx), events are gone.
  - On failure (network error, non-2xx), push events back to front of queue (up to `maxQueueSize`; drop overflow).
  - Wrap entire method in try/catch — never throw to caller.
  - Debug log on failures.

- [ ] Add auto-flush timer:
  - Start `setInterval(this.flush, this.config.flushInterval)` in constructor.
  - Store interval ID for cleanup.

- [ ] Add `destroy()` method:
  - Clear the interval timer.
  - Call `flush()` one last time (fire-and-forget).
  - Remove browser lifecycle listeners.

- [ ] Add browser lifecycle hooks (in constructor):
  - On `beforeunload`: flush with `keepalive: true` in fetch options.
  - On `visibilitychange` (document.hidden === true): flush.
  - Guard with `typeof window !== 'undefined'` for SSR/Node safety.
  - Store listeners for cleanup in `destroy()`.

- [ ] Add `flushAt` config option (optional, default to half of maxQueueSize = 50):
  - In `track()` and `page()`, if `queue.length >= flushAt`, trigger `flush()` (fire-and-forget).

### 3. SDK module exports (`packages/sdk/src/index.ts`)

- [ ] Add top-level `flush()` export.
- [ ] Add top-level `destroy()` export.

### 4. Tests (`packages/sdk/src/__tests__/flush.test.ts`)

- [ ] `flush()` sends queued events as POST to endpoint.
- [ ] `flush()` clears the queue after successful send.
- [ ] `flush()` includes correct headers (Content-Type, Authorization).
- [ ] `flush()` sends batch in `{ batch: [...] }` format.
- [ ] `flush()` on empty queue does nothing (no HTTP call).
- [ ] `flush()` on network failure keeps events in queue.
- [ ] `flush()` on non-2xx response keeps events in queue.
- [ ] `flush()` never throws to the caller.
- [ ] Auto-flush fires on interval.
- [ ] `destroy()` stops the auto-flush timer.
- [ ] Top-level `flush()` export works.
- [ ] Top-level `destroy()` export works.
- [ ] Queue capacity check: events are dropped when queue is full (existing, verify still works).

### 5. README update

- [ ] Document `flush()` method.
- [ ] Document `destroy()` method.
- [ ] Document auto-flush behavior and `flushInterval` config.
- [ ] Update config table if new options added.

## Verification

```bash
pnpm --filter @userpulse/sdk test     # Unit tests
pnpm --filter @userpulse/sdk build    # Build
pnpm lint                              # Lint
pnpm typecheck                         # Typecheck
pnpm build                             # Full workspace build
pnpm format:check                      # Format
```

## Definition of Done

- [ ] All acceptance criteria satisfied.
- [ ] Unit tests cover flush, auto-flush, error handling, and destroy.
- [ ] SDK builds and exports correctly.
- [ ] README updated.
- [ ] All checks pass.
