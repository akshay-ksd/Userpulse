# US-018 — Reset user identity

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Project Setup and Tracking SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** developer, **I want** to reset the active identity, **so that** events after sign-out are not attributed to the previous user.

## Acceptance criteria

- [x] The SDK provides a reset method.
- [x] Reset clears the active identified user reference.
- [x] Subsequent events use an anonymous or newly supplied identity.
- [x] The behavior is documented and tested.

## Story review

This story adds the `reset()` method to `@userpulse/sdk`. It follows the pattern established by `identify()` (US-016) — a method on `UserpulseClient`, a top-level convenience export, and unit tests.

**Scope boundaries:**
- **In scope:** `reset()` method on `UserpulseClient` and top-level export, clearing `userId` and `userTraits`, generating a new `anonymousId`, updating `UserpulseInstance` interface, README documentation, unit tests.
- **Out of scope:** `flush()` / HTTP transport (US-019), consent handling (US-020), server-side ingestion (US-021+). No network calls are made by `reset()`.

**Key decisions:**
- `reset()` takes no arguments. It clears `userId` to `null`, clears `userTraits` to `null`, and generates a fresh `anonymousId` (persisted to localStorage).
- Generating a new `anonymousId` ensures full identity separation — the previous user's anonymous ID is not carried forward. This matches standard analytics SDK behavior (Segment, Amplitude).
- The event queue is not cleared by `reset()` — queued events retain their original identity. Only future events use the new identity.
- The method never throws — errors are caught and logged if `debug: true`.
- After `reset()`, calling `track()` produces events with only the new `anonymousId` (no `userId`).

## Current codebase state (verified 2026-11-15)

- `packages/sdk/src/client.ts` — `UserpulseClient` class with `identify()`, `track()`, `page()`, `userId`, `userTraits`, `anonymousId` (readonly). No `reset()` method.
- `packages/sdk/src/types.ts` — `UserpulseInstance` has `identify()`, `track()`, `page()`. No `reset()`.
- `packages/sdk/src/index.ts` — Exports `init()`, `getClient()`, `track()`, `identify()`, `page()`, `_reset()`. No public `reset()` export.
- `packages/sdk/src/__tests__/identify.test.ts` — 11 identify tests. No reset tests.
- `packages/sdk/README.md` — Documents `init()`, `track()`, `identify()`, `page()`. References `reset()` as "coming in a future version".

## Dependencies

- **Upstream:** US-014 (Init SDK) — Done. US-016 (Identify user) — Done.
- **Downstream:** US-019 (Batch and flush — sends queued events).

## Implementation subtasks

### 1. SDK — Update interface (`types.ts`)

- [x] Add `reset(): void` to `UserpulseInstance` interface.

### 2. SDK — Implement `reset()` on `UserpulseClient` (`client.ts`)

- [x] Change `anonymousId` from `readonly` to mutable (private setter pattern or reassignable property).
- [x] Add `reset()` method that:
  - Sets `userId` to `null`.
  - Sets `userTraits` to `null`.
  - Generates a new anonymous ID via `generateUUID()`.
  - Persists the new anonymous ID via `persistAnonymousId()`.
  - Wraps in try/catch, logs debug warning on error.

### 3. SDK — Add top-level `reset()` export (`index.ts`)

- [x] Add `reset()` function that delegates to `currentClient.reset()`.
- [x] Warn if called before `init()`.

### 4. SDK — Unit tests (`__tests__/reset.test.ts`)

- [x] `reset()` clears userId to null.
- [x] `reset()` clears userTraits to null.
- [x] `reset()` generates a new anonymousId (different from the original).
- [x] Subsequent `track()` events after `reset()` have no userId.
- [x] Subsequent `track()` events after `reset()` use the new anonymousId.
- [x] Queued events before `reset()` retain their original identity.
- [x] `reset()` does not throw.
- [x] `reset()` works after `identify()` + `track()` cycle.
- [x] Top-level `reset()` warns if called before `init()`.
- [x] Top-level `reset()` delegates to client after `init()`.

### 5. SDK — Update README

- [x] Add `reset()` API documentation section.
- [x] Update the "coming in a future version" reference in `identify()` docs.

## Verification

1. `pnpm --filter @userpulse/sdk test` — all SDK tests pass.
2. `pnpm --filter @userpulse/sdk build` — builds to dist.
3. `pnpm typecheck` — all workspace packages pass.
4. `pnpm lint` — pass.
5. `pnpm build` — full workspace build pass.
6. `pnpm format:check` — pass.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Implementation follows existing SDK patterns.
- [x] Changes are limited to the task scope.
- [x] Unit tests added and passing.
- [x] Lint, typecheck, build, and format checks pass.
- [x] README updated with `reset()` documentation.
- [x] Task file and progress.md updated.

## Assumptions / open questions

- `reset()` generates a new `anonymousId` (full identity reset, not just clearing userId). This matches the standard behavior documented in the `identify()` README section.
- The event queue is preserved across resets — queued events keep their original identity.
