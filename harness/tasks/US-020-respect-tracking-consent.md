# US-020 — Respect tracking consent

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Event Collection)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15)
- **Created:** 2026-11-15

## Story

> **As a** product developer, **I want** tracking to respect the application's consent state, **so that** collection follows privacy requirements.

## Acceptance criteria

- [x] The SDK supports an explicit tracking consent or enablement control.
- [x] When tracking is disabled, non-essential events are not sent.
- [x] Consent changes apply to subsequent tracking.
- [x] The SDK does not bypass the customer's consent decision.

## Story review

This story adds a consent/enablement mechanism to the SDK. The developer should be able to:

1. **Set initial consent state** via config: `init({ apiKey: '...', trackingEnabled: false })`.
2. **Change consent at runtime**: `setTrackingEnabled(true/false)` or `setConsent(true/false)`.
3. When tracking is disabled: `track()`, `page()`, and `flush()` are no-ops. `identify()` and `reset()` still work (identity management is not event tracking).
4. When re-enabled, subsequent calls to `track()` and `page()` resume normal behavior.

**Scope boundaries:**
- No persistent consent state — the developer manages consent persistence (cookie banner, CMP, etc.) and passes the state to the SDK.
- No granular per-event-type consent — it's a single on/off toggle. Granular controls can be added later if needed.
- Events queued before disabling are still flushed (they were collected with consent); events queued while disabled are simply not created.
- `identify()` works regardless of consent state because it only sets local state and does not send events. `reset()` similarly.

**Design decision:** Use `trackingEnabled` as the config option name (boolean, defaults to `true`). Runtime method: `setTrackingEnabled(enabled: boolean)`. This is clearer than "consent" for developers and aligns with SDK naming conventions.

## Current codebase state

- `packages/sdk/src/client.ts` — `UserpulseClient` with `track()`, `page()`, `identify()`, `reset()`, `flush()`, `destroy()`. No consent mechanism.
- `packages/sdk/src/types.ts` — `UserpulseConfig`, `ResolvedConfig`, `UserpulseInstance` interfaces.
- `packages/sdk/src/index.ts` — Module-level singleton, top-level exports for all methods.
- `packages/sdk/src/__tests__/` — 77 tests across 5 files (init, track, page, identify, flush).
- `packages/sdk/README.md` — Full API documentation.

## Dependencies

- Upstream: US-014 through US-019 — all Done.
- Downstream: None directly. Event ingestion (US-021+) is unaffected.

## Implementation subtasks

### 1. SDK types (`packages/sdk/src/types.ts`)

- [x] Add `trackingEnabled?: boolean` to `UserpulseConfig`.
- [x] Add `trackingEnabled: boolean` to `ResolvedConfig`.
- [x] Add `readonly trackingEnabled: boolean` to `UserpulseInstance`.
- [x] Add `setTrackingEnabled(enabled: boolean): void` to `UserpulseInstance`.

### 2. SDK client (`packages/sdk/src/client.ts`)

- [x] Add `trackingEnabled: boolean` field to `UserpulseClient`, initialized from `config.trackingEnabled` (default `true`).
- [x] Add `trackingEnabled` to `resolveConfig()` (default `true`).
- [x] Add `setTrackingEnabled(enabled: boolean): void` method that sets `this.trackingEnabled`.
- [x] Guard `track()`: if `!this.trackingEnabled`, return early (before queueing). Debug log if `debug: true`.
- [x] Guard `page()`: if `!this.trackingEnabled`, return early (before queueing). Debug log if `debug: true`.
- [x] Guard `flush()`: if `!this.trackingEnabled`, return early (do not send). Debug log if `debug: true`.
- [x] `identify()` and `reset()` remain unguarded — they manage local identity state.

### 3. SDK module exports (`packages/sdk/src/index.ts`)

- [x] Add top-level `setTrackingEnabled(enabled: boolean): void` export.

### 4. Tests (`packages/sdk/src/__tests__/consent.test.ts`)

- [x] `trackingEnabled` defaults to `true` — events are tracked normally.
- [x] `init({ trackingEnabled: false })` — `track()` does not queue events.
- [x] `init({ trackingEnabled: false })` — `page()` does not queue events.
- [x] `init({ trackingEnabled: false })` — `flush()` does not send.
- [x] `init({ trackingEnabled: false })` — `identify()` still works (sets userId).
- [x] `init({ trackingEnabled: false })` — `reset()` still works (clears userId).
- [x] `setTrackingEnabled(false)` at runtime — subsequent `track()` calls are no-ops.
- [x] `setTrackingEnabled(true)` after being disabled — `track()` resumes normally.
- [x] Events queued before disabling remain in queue (not discarded).
- [x] Top-level `setTrackingEnabled()` export works.
- [x] Debug warnings when tracking disabled and debug mode on.

### 5. README update

- [x] Add `trackingEnabled` to config table.
- [x] Document `setTrackingEnabled()` method.
- [x] Add consent/privacy section explaining behavior.

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

- [x] All acceptance criteria satisfied.
- [x] Unit tests cover consent init, runtime toggle, method guards, and edge cases.
- [x] SDK builds and exports correctly.
- [x] README updated with consent documentation.
- [x] All checks pass.

## Assumptions / open questions

- `trackingEnabled` defaults to `true` (opt-out model). This matches common SDK conventions and the story's framing ("respect consent" implies the developer explicitly disables when needed).
- No persistent consent storage in the SDK — the developer is responsible for managing consent state and passing it in.
- `flush()` is guarded to prevent sending events that were queued with consent but where consent was withdrawn before flush. This is the safer choice for privacy. Alternatively, events already in queue could still be sent — but the simpler and more privacy-protective approach is to guard flush too.
