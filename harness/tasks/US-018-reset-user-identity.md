# US-018 — Reset user identity

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Event Collection)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — implemented as part of US-016; verified independently
- **Created:** 2026-11-15

## Story

> **As a** developer, **I want** to reset the active identity, **so that** events after sign-out are not attributed to the previous user.

## Acceptance criteria

- [x] The SDK provides a reset method. — `reset()` on `UserpulseClient` class, `UserpulseInstance` interface, and top-level module export.
- [x] Reset clears the active identified user reference. — Clears `userId` and `traits`, generates new `anonymousId`.
- [x] Subsequent events use an anonymous or newly supplied identity. — Tests verify no `userId` and new `anonymousId` in events after `reset()`.
- [x] The behavior is documented and tested. — README section on anonymous-to-identified behavior covers `reset()`; 6+ dedicated reset tests in `identify.test.ts`.

## Story review

This story's functionality was fully implemented during US-016 (Identify a user). The `reset()` method was a natural companion to `identify()` and was built in the same change set. No additional code is needed.

**Implementation already in place:**
- `packages/sdk/src/client.ts:162-172` — `reset()` method
- `packages/sdk/src/types.ts:39` — `reset()` on `UserpulseInstance` interface
- `packages/sdk/src/index.ts:54-59` — top-level `reset()` export
- `packages/sdk/src/__tests__/identify.test.ts:90-174` — reset test suite (clears userId, clears traits, events after reset, new anonymousId, top-level reset)
- `packages/sdk/README.md` — documented behavior

## Verification

- [x] Unit tests: `pnpm --filter @userpulse/sdk test` — 56 passed (includes 6+ reset-specific tests).
- [x] Build: `pnpm --filter @userpulse/sdk build` — pass.
- [x] Lint: `pnpm lint` — pass.
- [x] Typecheck: `pnpm typecheck` — pass.

## Definition of Done

- [x] All acceptance criteria satisfied (implemented in US-016).
- [x] Tests exist and pass.
- [x] Documented in README.
- [x] No additional code changes required.
