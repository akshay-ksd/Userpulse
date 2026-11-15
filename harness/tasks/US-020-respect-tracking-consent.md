# US-020 — Respect tracking consent

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Project Setup and Tracking SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** product developer, **I want** tracking to respect the application's consent state, **so that** collection follows privacy requirements.

## Acceptance criteria

- [x] The SDK supports an explicit tracking consent or enablement control.
- [x] When tracking is disabled, non-essential events are not sent.
- [x] Consent changes apply to subsequent tracking.
- [x] The SDK does not bypass the customer's consent decision.

## Story review

This story adds a consent/enablement mechanism to the SDK so that customer applications can control whether events are collected, fulfilling PRD requirement EVT-09 ("Tracking must support consent-aware collection") and TRUST-06.

**Scope boundaries:**
- This is an SDK-only change. No API or web app changes are needed.
- The SDK provides the *mechanism* for consent control; the *policy* (what constitutes consent, how it's obtained) is the customer application's responsibility.
- "Non-essential events" in this context means all `track()`, `page()`, and `identify()` calls. The SDK itself has no "essential" events that bypass consent.

**Design decisions:**
- Add an optional `enabled` field to `UserpulseConfig` (default `true` for backward compatibility).
- Add a runtime `setEnabled(enabled: boolean)` method to toggle tracking after initialization.
- When disabled: `track()`, `page()`, `identify()` silently no-op. `flush()` does nothing (does not send queued events). The auto-flush timer still ticks but `flush()` short-circuits.
- When re-enabled: subsequent `track()`/`page()`/`identify()` calls resume queuing events. Events that occurred while disabled are NOT retroactively captured.
- `reset()` is allowed while disabled (it's an identity operation, not a tracking event).
- `destroy()` is allowed while disabled (cleanup is not tracking).
- The `enabled` state is not persisted to localStorage — this is a runtime control the customer application manages.

**What is NOT in scope:**
- Granular per-event-type consent (e.g. allow page views but not custom events).
- Server-side consent enforcement (that's US-021+ ingestion boundary work).
- Consent UI or consent management platform integration.

## Current codebase state (verified 2026-11-15)

- `packages/sdk/src/types.ts` — `UserpulseConfig` interface (apiKey, endpoint?, flushInterval?, maxQueueSize?, debug?), `ResolvedConfig`, `UserpulseEvent`, `UserpulseInstance` (track, identify, page, reset, flush, destroy).
- `packages/sdk/src/client.ts` — `UserpulseClient` class with all methods. Has a `destroyed` flag pattern that we can follow for the `enabled` flag.
- `packages/sdk/src/index.ts` — Module-level functions delegating to `currentClient`. Has `setEnabled`-style pattern possible via the existing module exports.
- `packages/sdk/src/__tests__/` — 6 test files (init, track, identify, page, reset, flush), 82 total tests.
- `packages/sdk/README.md` — Documentation for all current methods.

## Dependencies

- **Upstream:** US-014 through US-019 (all Done). The SDK with track/identify/page/reset/flush must exist.
- **Downstream:** None directly. US-021+ (event ingestion) will enforce server-side controls independently.

## Implementation subtasks

### 1. Types (`packages/sdk/src/types.ts`)

- [x] Add `enabled?: boolean` to `UserpulseConfig` interface.
- [x] Add `enabled: boolean` to `ResolvedConfig` interface.
- [x] Add `setEnabled(enabled: boolean): void` to `UserpulseInstance` interface.
- [x] Add `readonly enabled: boolean` getter to `UserpulseInstance` interface for reading current state.

### 2. Client (`packages/sdk/src/client.ts`)

- [x] Add `private _enabled: boolean` property, initialized from `resolvedConfig.enabled`.
- [x] Add `get enabled(): boolean` getter.
- [x] Add `setEnabled(enabled: boolean): void` method.
- [x] Update `resolveConfig()` to include `enabled: config.enabled ?? true`.
- [x] Gate `track()`: return early (silently) if `!this._enabled`.
- [x] Gate `page()`: return early (silently) if `!this._enabled`.
- [x] Gate `identify()`: return early (silently) if `!this._enabled`.
- [x] Gate `flush()`: return early (no fetch) if `!this._enabled`.
- [x] Gate `flushSync()`: return early if `!this._enabled`.
- [x] Debug log when events are suppressed due to disabled state (only when `debug: true`).

### 3. Module exports (`packages/sdk/src/index.ts`)

- [x] Add top-level `setEnabled(enabled: boolean): void` function that delegates to `currentClient.setEnabled()`.
- [x] Handle not-initialized case with console.warn (same pattern as other functions).

### 4. Tests (`packages/sdk/src/__tests__/consent.test.ts`)

- [x] Test: `init({ enabled: false })` — track/page/identify silently no-op.
- [x] Test: `init({ enabled: false })` — flush does not send.
- [x] Test: `init()` defaults to enabled (backward compatibility).
- [x] Test: `setEnabled(false)` after init — subsequent track/page/identify no-op.
- [x] Test: `setEnabled(true)` re-enables tracking — subsequent track/page queued.
- [x] Test: events tracked while disabled are not retroactively captured when re-enabled.
- [x] Test: `reset()` works while disabled.
- [x] Test: `destroy()` works while disabled.
- [x] Test: `enabled` getter reflects current state.
- [x] Test: debug warnings logged when tracking suppressed and debug=true.
- [x] Test: top-level `setEnabled()` delegates to client.
- [x] Test: top-level `setEnabled()` warns when called before init.

### 5. Documentation (`packages/sdk/README.md`)

- [x] Add Consent / Tracking Control section documenting `enabled` config option and `setEnabled()` method.
- [x] Document behavior when disabled vs enabled.
- [x] Add usage example showing consent integration pattern.

## Verification

```bash
# Unit tests
pnpm --filter @userpulse/sdk test

# Build
pnpm --filter @userpulse/sdk build

# Typecheck
pnpm typecheck

# Full build
pnpm build

# Lint
pnpm lint

# Format
pnpm format:check
```

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Solution follows existing SDK patterns and conventions.
- [x] Changes are limited to the SDK package.
- [x] Unit tests added for consent behavior.
- [x] All tests pass.
- [x] Lint, typecheck, build, format checks pass.
- [x] README updated with consent documentation.
- [x] No unrelated changes introduced.
- [x] Progress tracker updated.

## Assumptions / open questions

- **Default enabled:** Tracking defaults to `enabled: true` for backward compatibility. Customers who need consent-first tracking pass `enabled: false` at init.
- **No persistence:** The `enabled` state is not stored in localStorage. The customer application is responsible for persisting and restoring consent state.
- **Binary control:** This is a simple on/off toggle, not granular per-event-type consent. Granular consent is a post-MVP enhancement.
- **Queue behavior when disabled:** Events are not queued while disabled. When re-enabled, only new events are captured.
