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

This story adds a `page()` method to `@userpulse/sdk`. It follows the exact pattern established by `track()` (US-015) and `identify()` (US-016) — a method on `UserpulseClient`, an interface update, a top-level convenience export, unit tests, and README documentation.

**Scope boundaries:**
- **In scope:** `page(name?, properties?)` method on `UserpulseClient` and top-level export, `UserpulseInstance` interface update, page-view event construction following the standard `UserpulseEvent` contract, README documentation, unit tests.
- **Out of scope:** `reset()` (US-018), `flush()` / HTTP transport (US-019), consent handling (US-020), automatic page-view detection (e.g., SPA route change listeners), server-side ingestion (US-021+).

**Key decisions:**
- `page(name?: string, properties?: Record<string, unknown>)` — both parameters are optional. If `name` is omitted, the event records a page view without a specific name (the path can be in properties). This matches common analytics SDK patterns (Segment, Mixpanel).
- The method constructs a standard `UserpulseEvent` with `eventName: '$page'` (a reserved system event name, prefixed with `$` to distinguish from user-defined events).
- `pageName` and `pagePath` fields on `UserpulseEvent` are populated from the `name` argument and `properties.path` respectively. The `UserpulseEvent` interface already has optional `pageName` and `pagePath` fields.
- **No automatic collection of URL, query parameters, referrer, or page content.** The developer explicitly passes what they want tracked. This satisfies the "sensitive query parameters and page content are not automatically collected" criterion.
- Error handling follows the same pattern as `track()` and `identify()`: invalid inputs silently ignored, full queue drops events, unexpected errors caught. Debug warnings when `debug: true`.
- Queue and event structure reuse: page events go into the same `queue` as track events. They use the same `UserpulseEvent` shape, enriched with `pageName`/`pagePath`.

## Current codebase state (verified 2026-11-15)

- `packages/sdk/src/client.ts` — `UserpulseClient` class with `config`, `anonymousId`, `sdkVersion`, `isInitialized`, `userId`, `userTraits`, `queue`, `identify()`, and `track()`. No `page()` method.
- `packages/sdk/src/types.ts` — `UserpulseEvent` already has optional `pageName?: string` and `pagePath?: string` fields. `UserpulseInstance` has `track()` and `identify()` but no `page()`.
- `packages/sdk/src/index.ts` — Exports `init()`, `getClient()`, `track()`, `identify()`, `_reset()`. No `page()` export.
- `packages/sdk/src/__tests__/` — `init.test.ts` (14 tests), `track.test.ts` (13 tests), `identify.test.ts` (11 tests). No page tests.
- `packages/sdk/README.md` — Documents `init()`, `track()`, `identify()`, `getClient()`, `SDK_VERSION`. No `page()` docs.

## Dependencies

- **Upstream:** US-014 (Init SDK) — Done. US-015 (Track event) — Done. US-016 (Identify user) — Done.
- **Downstream:** US-018 (Reset identity), US-019 (Flush events), US-021+ (Event ingestion — page events will be sent).

## Implementation subtasks

### 1. Update `UserpulseInstance` interface (`packages/sdk/src/types.ts`)

- [x] Add `page(name?: string, properties?: Record<string, unknown>): void` to `UserpulseInstance`.

### 2. Implement `page()` on `UserpulseClient` (`packages/sdk/src/client.ts`)

- [x] Add `page(name?: string, properties?: Record<string, unknown>): void` method.
- [x] Construct a `UserpulseEvent` with `eventName: '$page'`.
- [x] Set `pageName` from `name` argument when provided.
- [x] Set `pagePath` from `properties.path` when provided (then remove `path` from spread properties to avoid duplication).
- [x] Include `userId` when set (same as `track()`).
- [x] Include remaining `properties` in the event's `properties` field.
- [x] Respect queue bounds, same as `track()`.
- [x] Wrap in try/catch, same error-handling pattern as `track()`.

### 3. Add top-level `page()` function (`packages/sdk/src/index.ts`)

- [x] Export `page(name?: string, properties?: Record<string, unknown>): void`.
- [x] Warn if called before `init()` (same pattern as `track()` and `identify()`).

### 4. Update README (`packages/sdk/README.md`)

- [x] Add `page()` documentation with usage examples.
- [x] Document parameters: `name` (optional page name), `properties` (optional, including `path`).
- [x] Note that no sensitive data is automatically collected.

### 5. Unit tests (`packages/sdk/src/__tests__/page.test.ts`)

- [x] `page()` with name adds a `$page` event to the queue.
- [x] `page()` with name and properties adds both.
- [x] `page()` with `properties.path` sets `pagePath` on the event.
- [x] `page()` without arguments adds a `$page` event (no name, no properties).
- [x] `page()` event follows standard contract (eventId, timestamp, anonymousId, sdkVersion).
- [x] `page()` includes `userId` when set via `identify()`.
- [x] `page()` does not include `userId` before `identify()`.
- [x] `page()` drops events when queue is full.
- [x] `page()` logs debug warning when queue full and debug is true.
- [x] Top-level `page()` before `init()` does not throw, warns.
- [x] Top-level `page()` delegates to client after `init()`.

### 6. Build verification

- [x] `pnpm --filter @userpulse/sdk test` — 51 passed (14 init + 13 track + 11 identify + 13 page).
- [x] `pnpm --filter @userpulse/sdk build` — produces dist.
- [x] `pnpm typecheck` — clean.
- [x] `pnpm build` — full workspace passes.
- [x] `pnpm lint` — clean (pre-existing API warnings only).
- [x] `pnpm format:check` — clean.

## Verification

1. `pnpm --filter @userpulse/sdk test` — 51 passed (14 init + 13 track + 11 identify + 13 page).
2. `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
3. `pnpm typecheck` — clean.
4. `pnpm build` — full workspace passes.
5. `pnpm lint` — clean (pre-existing API warnings only).
6. `pnpm format:check` — clean.

## Definition of Done

- [x] All acceptance criteria are met.
- [x] `page()` method is exposed on the SDK public API.
- [x] Page events use standard `UserpulseEvent` contract.
- [x] No sensitive data is automatically collected.
- [x] Invalid inputs are handled gracefully (no throw, no crash).
- [x] Unit tests cover happy paths and error cases.
- [x] README documents the `page()` method.
- [x] Full workspace build, lint, typecheck, and format pass.
- [x] Progress.md and task file updated.

## Assumptions / open questions

- **Reserved event name:** `$page` is used as the event name for page-view events. The `$` prefix distinguishes system events from user-defined events. This is a common analytics SDK convention (Segment uses `page`, Mixpanel uses `$mp_page_view`).
- **No auto-collection:** The SDK does not read `window.location`, `document.title`, `document.referrer`, or query parameters. The developer explicitly passes page name and path. This is the safest default for privacy compliance (DPDP/GDPR).
- **`pagePath` from properties:** If the developer passes `{ path: '/settings' }` in properties, it is extracted to the top-level `pagePath` field for consistent querying. The remaining properties stay in the `properties` object.
- **No flush yet:** Page events queue locally like track events. They will be sent when `flush()` is implemented (US-019/US-021).
