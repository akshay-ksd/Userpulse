# US-015 — Track a product event

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Project Setup and Tracking SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** developer, **I want** to record a named event, **so that** the platform can analyze a user action.

## Acceptance criteria

- [x] The SDK exposes a documented `track` method.
- [x] Event name and optional structured properties are supported.
- [x] An event timestamp is recorded.
- [x] Invalid payloads are handled without crashing the customer application.
- [x] The event is associated with the initialized project.

## Story review

This story adds the `track()` method to `@userpulse/sdk`. It is the first event-producing method in the SDK and establishes the pattern for `identify()`, `page()`, and other event methods in US-016+.

**Scope boundaries:**
- **In scope:** `track(eventName, properties?)` method on `UserpulseClient`, top-level `track()` convenience function in `index.ts`, `UserpulseInstance` interface update, event construction (eventId, timestamp, anonymousId, sdkVersion), queue management (push to internal queue, respect `maxQueueSize`), graceful error handling (never crash the host app), README update, unit tests.
- **Out of scope:** `identify()` (US-016), `page()` (US-017), `reset()` (US-018), `flush()` / HTTP transport (US-019), consent handling (US-020), server-side ingestion (US-021+). No network calls are made by `track()` — events are queued locally.

**Key decisions:**
- `track()` validates `eventName` (non-empty string). Invalid calls log a warning (if `debug: true`) and return silently — never throw, to protect the customer application.
- Events are queued in the existing `queue` array. When `queue.length >= maxQueueSize`, the oldest event is dropped (or the new event is dropped — dropping the new event is simpler and avoids unbounded growth). We'll drop the new event with a debug warning, since flush isn't implemented yet.
- `eventId` is generated via `crypto.randomUUID()`.
- `timestamp` is `new Date().toISOString()`.
- The event is associated with the project through the API key in `config.apiKey` — the server resolves project identity from the key at ingestion time. The SDK does not embed `organizationId` or `projectId` in the event payload.
- `properties` is optional `Record<string, unknown>`. No deep validation — the server validates at ingestion.

## Current codebase state (verified 2026-11-15)

- `packages/sdk/src/client.ts` — `UserpulseClient` class with constructor, `config`, `anonymousId`, `sdkVersion`, `isInitialized`, and an internal `queue: UserpulseEvent[]`. No `track()` method yet.
- `packages/sdk/src/types.ts` — `UserpulseEvent` interface already has all needed fields (`eventId`, `eventName`, `timestamp`, `anonymousId`, `userId?`, `sessionId?`, `properties?`, `pageName?`, `pagePath?`, `sdkVersion`). `UserpulseInstance` interface has read-only props but no methods.
- `packages/sdk/src/index.ts` — Exports `init()`, `getClient()`, `_reset()`. Module-level `currentClient` singleton. No `track()` export.
- `packages/sdk/src/__tests__/init.test.ts` — 14 tests for init. No event tests.
- `packages/sdk/README.md` — Documents `init()` and `getClient()`. No `track()` docs.

## Dependencies

- **Upstream:** US-014 (Install and initialize the SDK) — Done.
- **Downstream:** US-016 (Identify a user — `identify()` follows the same event pattern), US-017 (Track page views — `page()` follows the same pattern), US-019 (Batch and flush events — consumes the queue `track()` writes to).

## Implementation subtasks

### 1. Update `UserpulseInstance` interface (`packages/sdk/src/types.ts`)

- [x] Add `track(eventName: string, properties?: Record<string, unknown>): void` to `UserpulseInstance`.

### 2. Implement `track()` on `UserpulseClient` (`packages/sdk/src/client.ts`)

- [x] Add `track(eventName: string, properties?: Record<string, unknown>): void` method:
  - Validate `eventName`: must be a non-empty string. If invalid, log a debug warning and return (never throw).
  - Check queue capacity: if `queue.length >= config.maxQueueSize`, log a debug warning and return (drop the event).
  - Construct a `UserpulseEvent`:
    - `eventId`: `crypto.randomUUID()`
    - `eventName`: the provided name
    - `timestamp`: `new Date().toISOString()`
    - `anonymousId`: `this.anonymousId`
    - `properties`: the provided properties (if any)
    - `sdkVersion`: `this.sdkVersion`
  - Push the event to `this.queue`.
  - Wrap the entire method in try/catch — if anything unexpected happens, log a debug warning and return silently.

### 3. Add top-level `track()` function (`packages/sdk/src/index.ts`)

- [x] Export `track(eventName: string, properties?: Record<string, unknown>): void`:
  - If `currentClient` is null, log a warning and return (never throw).
  - Delegate to `currentClient.track(eventName, properties)`.

### 4. Update README (`packages/sdk/README.md`)

- [x] Add `track()` documentation with usage example:
  ```typescript
  import { track } from '@userpulse/sdk';
  track('button_clicked', { buttonId: 'signup-cta' });
  ```
- [x] Document parameters: `eventName` (required string), `properties` (optional object).
- [x] Note that events are queued locally and will be flushed in a future version (US-019).

### 5. Unit tests (`packages/sdk/src/__tests__/track.test.ts`)

- [x] `track()` with valid event name adds an event to the queue.
- [x] `track()` with event name and properties adds an event with those properties.
- [x] Queued event has correct shape: `eventId` (UUID format), `eventName`, `timestamp` (ISO string), `anonymousId`, `sdkVersion`.
- [x] `track()` with empty string event name does not add to queue.
- [x] `track()` with non-string event name does not add to queue (and does not throw).
- [x] `track()` when queue is full (maxQueueSize reached) does not add to queue.
- [x] `track()` before `init()` does not throw (top-level function).
- [x] Multiple `track()` calls add multiple events to the queue.
- [x] Event timestamp is a valid ISO 8601 string.
- [x] Event `anonymousId` matches the client's `anonymousId`.

### 6. Build verification

- [x] `pnpm --filter @userpulse/sdk test` — 27 passed (14 init + 13 track).
- [x] `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
- [x] `pnpm typecheck` — clean.
- [x] `pnpm build` — full workspace build passes.
- [x] `pnpm lint` — clean (pre-existing API warnings only).
- [x] `pnpm format:check` — clean.

## Verification

1. `pnpm --filter @userpulse/sdk test` — 27 passed (14 init + 13 track).
2. `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
3. `pnpm typecheck` — clean.
4. `pnpm build` — full workspace build passes.
5. `pnpm lint` — clean (pre-existing API warnings only).
6. `pnpm format:check` — clean.

## Definition of Done

- [x] All acceptance criteria are met.
- [x] `track()` method is exposed on the SDK public API.
- [x] Events are queued with correct structure (eventId, eventName, timestamp, anonymousId, sdkVersion, properties).
- [x] Invalid inputs are handled gracefully (no throw, no crash).
- [x] Unit tests cover happy paths and error cases.
- [x] README documents the `track()` method.
- [x] Full workspace build, lint, typecheck, and format pass.
- [x] Progress.md and task file updated.

## Assumptions / open questions

- **No flush yet:** `track()` only queues events. Actual HTTP transport is US-019/US-021. The queue will grow until `maxQueueSize`, then new events are dropped.
- **No `userId`/`sessionId` yet:** These fields are populated by `identify()` (US-016). `track()` events before `identify()` carry only `anonymousId`.
- **Project association:** The event is associated with the project via the API key in the SDK config. The server resolves `projectId`/`organizationId` from the key hash at ingestion time.
- **Properties validation:** The SDK does not deep-validate `properties`. The server validates at the ingestion boundary (US-021+).
