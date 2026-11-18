# US-017 — Track page views

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Project Setup and Tracking SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** developer, **I want** to record page or screen views, **so that** I can understand which parts of my product users visit.

## Acceptance criteria

- [x] The SDK provides a page or screen tracking method.
- [x] Page name and path can be recorded.
- [x] Page-view events follow the standard event contract.
- [x] Sensitive query parameters and page content are not automatically collected.

## Story review

This story adds a `page()` method to `@userpulse/sdk`. It records page/screen view events using the same event contract as `track()` — queued locally with `eventId`, `timestamp`, `anonymousId`, optional `userId`, and `sdkVersion`.

**Scope boundaries:**
- **In scope:** `page(name?, properties?)` method on `UserpulseClient`, top-level `page()` convenience function in `index.ts`, `UserpulseInstance` interface update, README documentation, unit tests.
- **Out of scope:** Automatic page-view tracking (e.g. history listener), `flush()` / HTTP transport (US-019), consent handling (US-020). No network calls are made.

**Key decisions:**
- `page(name?, properties?)` — both parameters are optional. If `name` is omitted, the developer must provide it via `properties` or the event records no page name (the SDK does not auto-detect `document.title` or `window.location` to avoid collecting sensitive data).
- The event uses `eventName: '$page'` — a reserved system event name prefixed with `$` to distinguish it from custom track events. This follows common analytics SDK conventions.
- `properties` can include `path`, `title`, `url`, `referrer`, `search` etc. as the developer chooses. The SDK does NOT auto-collect `window.location.search`, `document.title`, `document.referrer`, or any other browser globals — the developer explicitly passes what they want tracked.
- The event follows the exact same `UserpulseEvent` contract as `track()` — same `eventId`, `timestamp`, `anonymousId`, `userId` (if identified), `sdkVersion`, `properties`.
- Queue management, error handling, and debug logging follow the same patterns as `track()`.
- No new types needed — `UserpulseEvent` already has optional `properties` which can carry page name, path, etc.

## Current codebase state (verified 2026-11-15)

- `packages/sdk/src/client.ts` — `UserpulseClient` with `track()`, `identify()`, `reset()`. No `page()` method.
- `packages/sdk/src/types.ts` — `UserpulseEvent` with `eventId`, `eventName`, `timestamp`, `anonymousId`, `userId?`, `properties?`, `sdkVersion`. `UserpulseInstance` has `track()`, `identify()`, `reset()` but no `page()`.
- `packages/sdk/src/index.ts` — Top-level exports: `init()`, `getClient()`, `track()`, `identify()`, `reset()`, `_reset()`. No `page()`.
- `packages/sdk/src/__tests__/` — `init.test.ts` (14 tests), `track.test.ts` (13 tests), `identify.test.ts` (16 tests). No page tests.
- `packages/sdk/README.md` — Documents `init()`, `track()`, `identify()`, `reset()`, `getClient()`. No `page()` docs.

## Dependencies

- **Upstream:** US-014 (SDK init) — Done. US-015 (track) — Done. US-016 (identify) — Done.
- **Downstream:** US-019 (flush — sends queued events including page views).

## Implementation subtasks

### 1. Update `UserpulseInstance` interface (`packages/sdk/src/types.ts`)

- [x] Add `page(name?: string, properties?: Record<string, unknown>): void` to `UserpulseInstance`.

### 2. Implement `page()` on `UserpulseClient` (`packages/sdk/src/client.ts`)

- [x] Implement `page(name?: string, properties?: Record<string, unknown>): void`:
  - Check queue capacity (same as `track()`). If full, log debug warning and return.
  - Build a `UserpulseEvent` with `eventName: '$page'`.
  - If `name` is provided (non-empty string), include it in `properties` as `{ name, ...properties }`.
  - Include `anonymousId`, `userId` (if set), `timestamp`, `eventId`, `sdkVersion`.
  - Include caller-provided `properties` (merged with `name` if provided).
  - Push to `this.queue`.
  - Wrap in try/catch — never throw.
  - If `name` is provided but not a string, log debug warning and proceed without name (don't fail).

### 3. Add top-level `page()` function (`packages/sdk/src/index.ts`)

- [x] Export `page(name?: string, properties?: Record<string, unknown>): void`:
  - If `currentClient` is null, log a warning and return.
  - Delegate to `currentClient.page(name, properties)`.

### 4. Update README (`packages/sdk/README.md`)

- [x] Add `page()` documentation with usage examples.
- [x] Document that sensitive query parameters and page content are NOT automatically collected.
- [x] Show examples: page with name only, with name and properties, with properties only.

### 5. Unit tests (`packages/sdk/src/__tests__/page.test.ts`)

- [x] `page()` with name queues event with `eventName: '$page'` and name in properties.
- [x] `page()` with name and properties merges them.
- [x] `page()` without name queues event with `eventName: '$page'` and no name in properties.
- [x] `page()` with only properties queues event with those properties.
- [x] Page events include `eventId`, `timestamp`, `anonymousId`, `sdkVersion`.
- [x] Page events include `userId` after `identify()`.
- [x] Page events do not include `userId` before `identify()`.
- [x] `page()` on full queue drops silently (debug warning).
- [x] `page()` does not auto-collect `window.location`, `document.title`, etc.
- [x] Top-level `page()` before `init()` warns and does not throw.
- [x] Top-level `page()` delegates to client after init.

### 6. Build verification

- [x] `pnpm --filter @userpulse/sdk test` — 56 passed (14 init + 13 track + 16 identify + 13 page).
- [x] `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
- [x] `pnpm typecheck` — SDK clean (pre-existing API Prisma type issues unrelated).
- [x] `pnpm build` — SDK + web clean (pre-existing API build issues unrelated).
- [x] `pnpm lint` — clean.
- [x] `pnpm format:check` — clean.

## Verification

1. `pnpm --filter @userpulse/sdk test` — 56 passed (14 init + 13 track + 16 identify + 13 page).
2. `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
3. `pnpm typecheck` — SDK clean (pre-existing API Prisma type issues unrelated).
4. `pnpm build` — SDK + web clean (pre-existing API build issues unrelated).
5. `pnpm lint` — clean.
6. `pnpm format:check` — clean.

## Definition of Done

- [x] All acceptance criteria are met.
- [x] `page()` is exposed on the SDK public API.
- [x] Page events use the standard `UserpulseEvent` contract with `eventName: '$page'`.
- [x] No sensitive data is auto-collected.
- [x] Unit tests cover happy paths and edge cases.
- [x] README documents `page()` with examples and privacy note.
- [x] Full workspace build, lint, typecheck, and format pass.
- [x] Progress.md and task file updated.

## Assumptions / open questions

- **No auto-tracking:** The SDK does not install a `popstate` or `history` listener. Auto page-view tracking may be added as a separate opt-in feature later.
- **`$page` event name:** Using a `$`-prefixed reserved name distinguishes system events from custom user events. The server can filter/group by this convention.
- **No `document`/`window` access:** The SDK never reads browser globals for page data. This ensures SSR compatibility and prevents accidental collection of sensitive URL parameters (tokens, session IDs, PII in query strings).
