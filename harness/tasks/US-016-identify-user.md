# US-016 — Identify a user

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Project Setup and Tracking SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** developer, **I want** to associate activity with a stable user reference, **so that** analytics can distinguish users across events.

## Acceptance criteria

- [x] The SDK exposes an identity method.
- [x] The developer can provide a customer-defined user reference.
- [x] Subsequent events use the active identity.
- [x] Email or other personal information is not required.
- [x] Anonymous-to-identified behavior is documented.

## Story review

This story adds the `identify()` method to `@userpulse/sdk`. It follows the pattern established by `track()` (US-015) — a method on `UserpulseClient`, a top-level convenience export, and unit tests.

**Scope boundaries:**
- **In scope:** `identify(userId, traits?)` method on `UserpulseClient` and top-level export, storing `userId` on the client instance, including `userId` in subsequent `track()` events, updating `UserpulseInstance` interface, README documentation, unit tests.
- **Out of scope:** `page()` (US-017), `reset()` (US-018), `flush()` / HTTP transport (US-019), consent handling (US-020), server-side ingestion (US-021+). No network calls are made by `identify()`.

**Key decisions:**
- `identify(userId, traits?)` accepts a required string `userId` and optional `traits` object (`Record<string, unknown>`). `userId` is the customer-defined user reference (e.g., internal user ID, username). Email or PII is not required.
- The `userId` is stored as a mutable property on `UserpulseClient`. Once set, all subsequent events from `track()` include `userId` in the event payload. The `UserpulseEvent` interface already has `userId?: string`.
- `traits` are user properties (name, plan, etc.) — they are stored on the client for future use (e.g., sent with flush) but not embedded in every track event. We'll store them as `userTraits` on the client.
- Calling `identify()` with an empty or non-string `userId` logs a debug warning and returns silently (never throw).
- Calling `identify()` with a new `userId` replaces the previous one (identity switch). The `anonymousId` is preserved for linking anonymous-to-identified sessions.
- The method never throws — all errors are caught and logged if `debug: true`.
- Anonymous-to-identified behavior: before `identify()`, events carry only `anonymousId`. After `identify()`, events carry both `anonymousId` and `userId`. This is documented in the README.

## Current codebase state (verified 2026-11-15)

- `packages/sdk/src/client.ts` — `UserpulseClient` class with `config`, `anonymousId`, `sdkVersion`, `isInitialized`, `queue`, and `track()`. No `identify()` or `userId` property.
- `packages/sdk/src/types.ts` — `UserpulseEvent` already has `userId?: string`. `UserpulseInstance` has `track()` but no `identify()`.
- `packages/sdk/src/index.ts` — Exports `init()`, `getClient()`, `track()`, `_reset()`. No `identify()` export.
- `packages/sdk/src/__tests__/track.test.ts` — 13 track tests. No identify tests.
- `packages/sdk/README.md` — Documents `init()`, `getClient()`, `track()`. No `identify()` docs.

## Dependencies

- **Upstream:** US-014 (Init SDK) — Done. US-015 (Track event) — Done.
- **Downstream:** US-017 (Page views — will follow same pattern), US-018 (Reset identity — clears what `identify()` sets), US-019 (Flush — sends queued events including userId).

## Implementation subtasks

### 1. Update `UserpulseInstance` interface (`packages/sdk/src/types.ts`)

- [x] Add `identify(userId: string, traits?: Record<string, unknown>): void` to `UserpulseInstance`.
- [x] Add `readonly userId: string | null` to `UserpulseInstance`.

### 2. Implement `identify()` on `UserpulseClient` (`packages/sdk/src/client.ts`)

- [x] Add mutable `userId: string | null = null` property (initialized to null).
- [x] Add mutable `userTraits: Record<string, unknown> | null = null` property (internal, not on public interface).
- [x] Add `identify(userId: string, traits?: Record<string, unknown>): void` method.
- [x] Update `track()` to include `userId` in the constructed event when `this.userId` is set.

### 3. Add top-level `identify()` function (`packages/sdk/src/index.ts`)

- [x] Export `identify(userId: string, traits?: Record<string, unknown>): void`.

### 4. Update README (`packages/sdk/README.md`)

- [x] Add `identify()` documentation with usage example.
- [x] Document parameters and anonymous-to-identified behavior.
- [x] Note that email/PII is not required.

### 5. Unit tests (`packages/sdk/src/__tests__/identify.test.ts`)

- [x] `identify()` with valid userId sets `client.userId`.
- [x] `identify()` with userId and traits stores both.
- [x] After `identify()`, `track()` events include `userId`.
- [x] Before `identify()`, `track()` events do not include `userId`.
- [x] `identify()` with empty string does not set userId.
- [x] `identify()` with non-string userId does not set userId (and does not throw).
- [x] `identify()` with a new userId replaces the previous one.
- [x] After `identify()`, events still include `anonymousId`.
- [x] `identify()` before `init()` does not throw (top-level function).
- [x] `identify()` with traits stores traits on the client.

### 6. Build verification

- [x] `pnpm --filter @userpulse/sdk test` — 38 passed (14 init + 13 track + 11 identify).
- [x] `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
- [x] `pnpm typecheck` — clean.
- [x] `pnpm build` — full workspace build passes.
- [x] `pnpm lint` — clean (pre-existing API warnings only).
- [x] `pnpm format:check` — clean.

## Verification

1. `pnpm --filter @userpulse/sdk test` — 38 passed (14 init + 13 track + 11 identify).
2. `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
3. `pnpm typecheck` — clean.
4. `pnpm build` — full workspace build passes.
5. `pnpm lint` — clean (pre-existing API warnings only).
6. `pnpm format:check` — clean.

## Definition of Done

- [x] All acceptance criteria are met.
- [x] `identify()` method is exposed on the SDK public API.
- [x] `userId` is included in subsequent `track()` events.
- [x] Invalid inputs are handled gracefully (no throw, no crash).
- [x] Unit tests cover happy paths and error cases.
- [x] README documents the `identify()` method and anonymous-to-identified behavior.
- [x] Full workspace build, lint, typecheck, and format pass.
- [x] Progress.md and task file updated.

## Assumptions / open questions

- **No flush yet:** `identify()` stores the userId locally. It will be sent to the server when `flush()` is implemented (US-019/US-021).
- **Traits storage:** Traits are stored on the client but not included in every track event. They can be sent as part of an identify event at flush time, or included in a separate user-properties sync. This aligns with common analytics SDK patterns (e.g., Segment, Mixpanel).
- **Identity switch:** Calling `identify()` with a different `userId` simply replaces the current one. A full identity reset (new anonymousId) is US-018.
- **No server-side resolution:** The SDK does not validate `userId` against any server-side user table. The server matches events to users at ingestion time.
