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

This story adds the `identify()` method to `@userpulse/sdk`. It allows developers to associate a known user ID with subsequent events, enabling the platform to link anonymous activity to identified users.

**Scope boundaries:**
- **In scope:** `identify(userId, traits?)` method on `UserpulseClient`, top-level `identify()` convenience function in `index.ts`, `UserpulseInstance` interface update, `reset()` stub (clearing userId), README update with anonymous-to-identified documentation, unit tests.
- **Out of scope:** `page()` (US-017), `flush()` / HTTP transport (US-019), server-side identity resolution/merging, consent handling (US-020). No network calls are made.

**Key decisions:**
- `identify(userId, traits?)` sets `this.userId` on the client. Subsequent `track()` calls include `userId` in the event payload.
- `userId` is a string — the customer's own user identifier. No email or PII is required.
- `traits` is optional `Record<string, unknown>` for user attributes (name, plan, etc.). Stored on the client for future server-side sync but not embedded in every track event (only `userId` is).
- `reset()` clears the `userId` and `traits`, regenerates the `anonymousId`, reverting to anonymous mode. This is needed for logout flows.
- `identify()` with empty/invalid userId logs a debug warning and returns silently (never throws).
- The `UserpulseEvent` type already has `userId?: string` — no type changes needed.

## Current codebase state (verified 2026-11-15)

- `packages/sdk/src/client.ts` — `UserpulseClient` with `track()`, `config`, `anonymousId`, `sdkVersion`, `queue`. No `identify()` or `userId` property.
- `packages/sdk/src/types.ts` — `UserpulseEvent` already has `userId?: string`. `UserpulseInstance` has `track()` but no `identify()` or `reset()`.
- `packages/sdk/src/index.ts` — Exports `init()`, `getClient()`, `track()`, `_reset()`. No `identify()` or `reset()`.
- `packages/sdk/src/__tests__/track.test.ts` — 13 tests for track. No identity tests.
- `packages/sdk/README.md` — Documents `init()`, `track()`, `getClient()`. No `identify()` docs.

## Dependencies

- **Upstream:** US-014 (SDK init) — Done. US-015 (track) — Done.
- **Downstream:** US-017 (page views — will use the same `userId`), US-019 (flush — sends events with identity).

## Implementation subtasks

### 1. Update `UserpulseInstance` interface (`packages/sdk/src/types.ts`)

- [x] Add `userId` readonly optional property: `readonly userId?: string`
- [x] Add `identify(userId: string, traits?: Record<string, unknown>): void` to `UserpulseInstance`.
- [x] Add `reset(): void` to `UserpulseInstance`.

### 2. Implement `identify()` and `reset()` on `UserpulseClient` (`packages/sdk/src/client.ts`)

- [x] Add mutable `userId?: string` property (not readonly on the class — readonly on the interface).
- [x] Add mutable `traits?: Record<string, unknown>` property (internal, not on interface).
- [x] Implement `identify(userId: string, traits?: Record<string, unknown>): void`:
  - Validate `userId`: must be a non-empty string. If invalid, log a debug warning and return.
  - Set `this.userId = userId`.
  - Set `this.traits = traits` (or undefined if not provided).
  - Wrap in try/catch — never throw.
- [x] Implement `reset(): void`:
  - Clear `this.userId` to undefined.
  - Clear `this.traits` to undefined.
  - Generate a new `anonymousId` and persist it.
  - Wrap in try/catch — never throw.
- [x] Update `track()` to include `userId` in the event when set:
  - Add `...(this.userId !== undefined && { userId: this.userId })` to the event object.

### 3. Add top-level `identify()` and `reset()` functions (`packages/sdk/src/index.ts`)

- [x] Export `identify(userId: string, traits?: Record<string, unknown>): void`:
  - If `currentClient` is null, log a warning and return.
  - Delegate to `currentClient.identify(userId, traits)`.
- [x] Export `reset(): void`:
  - If `currentClient` is null, log a warning and return.
  - Delegate to `currentClient.reset()`.

### 4. Update README (`packages/sdk/README.md`)

- [x] Add `identify()` documentation with usage example.
- [x] Add `reset()` documentation with usage example.
- [x] Document anonymous-to-identified behavior: events before `identify()` carry only `anonymousId`; after `identify()`, events carry both `anonymousId` and `userId`; after `reset()`, a new `anonymousId` is generated and `userId` is cleared.

### 5. Unit tests (`packages/sdk/src/__tests__/identify.test.ts`)

- [x] `identify()` sets userId on the client.
- [x] `identify()` with traits stores traits.
- [x] After `identify()`, `track()` events include `userId`.
- [x] Before `identify()`, `track()` events do not include `userId`.
- [x] `identify()` with empty string does not set userId.
- [x] `identify()` with non-string does not set userId (no throw).
- [x] `identify()` can be called multiple times (last wins).
- [x] `reset()` clears userId.
- [x] `reset()` generates a new anonymousId.
- [x] After `reset()`, `track()` events do not include `userId`.
- [x] Top-level `identify()` before `init()` warns and does not throw.
- [x] Top-level `reset()` before `init()` warns and does not throw.
- [x] Top-level `identify()` delegates to client after init.

### 6. Build verification

- [x] `pnpm --filter @userpulse/sdk test` — 43 passed (14 init + 13 track + 16 identify).
- [x] `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
- [x] `pnpm typecheck` — SDK clean (pre-existing web/api issues unrelated).
- [x] `pnpm build` — SDK clean (pre-existing web/api issues unrelated).
- [x] `pnpm lint` — clean.
- [x] `pnpm format:check` — clean.

## Verification

1. `pnpm --filter @userpulse/sdk test` — 43 passed (14 init + 13 track + 16 identify).
2. `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
3. `pnpm typecheck` — SDK clean (pre-existing web `LayoutProps` and API type issues unrelated).
4. `pnpm build` — SDK clean (pre-existing API build issues unrelated).
5. `pnpm lint` — clean.
6. `pnpm format:check` — clean.

## Definition of Done

- [x] All acceptance criteria are met.
- [x] `identify()` and `reset()` are exposed on the SDK public API.
- [x] `track()` events include `userId` after `identify()` is called.
- [x] Invalid inputs are handled gracefully (no throw, no crash).
- [x] Unit tests cover happy paths and error cases.
- [x] README documents `identify()`, `reset()`, and anonymous-to-identified behavior.
- [x] Full workspace build, lint, typecheck, and format pass.
- [x] Progress.md and task file updated.

## Assumptions / open questions

- **No server-side identity merge:** The SDK simply stamps `userId` on events. Server-side identity resolution (linking anonymous events to identified users) is a backend concern for US-021+.
- **Traits are stored locally:** `traits` are kept on the client instance for potential future use (e.g., user property sync endpoint). They are not included in every track event — only `userId` is.
- **`reset()` for logout:** When a user logs out of the customer's app, calling `reset()` generates a fresh anonymous ID and clears the identity, preventing data leakage between users on a shared device.
