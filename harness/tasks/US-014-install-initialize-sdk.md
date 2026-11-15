# US-014 — Install and initialize the SDK

- **Epic:** EP-04 SDK and Event Tracking
- **Priority:** P0 (M2 — Project Setup and Tracking SDK)
- **Source:** `harness/user-stories.md`
- **Status:** Done (2026-11-15) — see `harness/progress.md` for verification record
- **Created:** 2026-11-15

## Story

> **As a** developer, **I want** to install and initialize the tracking SDK, **so that** my application can send usage events.

## Acceptance criteria

- [x] Installation instructions are available.
- [x] The SDK initializes using the project's tracking credential.
- [x] Invalid configuration produces a clear error.
- [x] Initialization does not block normal application usage.
- [x] The SDK version is identifiable in submitted events.

## Story review

This story creates the `@userpulse/sdk` package — a lightweight, browser-compatible JavaScript/TypeScript tracking SDK that customer developers install in their applications. It covers initialization only; the actual `track()`, `identify()`, `page()`, `reset()`, and `flush()` methods are separate stories (US-015 through US-020).

**Scope boundaries:**
- **In scope:** Package scaffolding (`packages/sdk`), `init()` function, configuration validation, anonymous session ID generation, SDK version embedding, event queue skeleton (empty but ready for US-015+), basic README with installation instructions.
- **Out of scope:** `track()`, `identify()`, `page()`, `reset()`, `flush()` implementations (US-015–US-019). Actual HTTP transport to the ingestion endpoint (US-019/US-021). Consent handling (US-020).

**Key decisions:**
- The SDK is a pure TypeScript package with no runtime dependencies. It targets modern browsers and Node.js.
- `init()` accepts `{ apiKey: string, endpoint?: string, flushInterval?: number, maxQueueSize?: number }`. `apiKey` is required; the rest have sensible defaults.
- The SDK stores its configuration in module-level state (singleton pattern, matching typical analytics SDK conventions like Segment, PostHog, Mixpanel).
- Invalid configuration (missing/empty `apiKey`) throws a synchronous error so developers catch it during development. Initialization itself is synchronous and non-blocking.
- The SDK generates a random `anonymousId` (UUID v4) on init if none exists, stored in `localStorage` where available (browser) or in-memory (Node.js/SSR).
- `sdkVersion` is embedded from `package.json` at build time.
- The event queue is initialized as an empty bounded array; actual enqueue/flush logic is US-015/US-019.

## Current codebase state (verified 2026-11-15)

- `packages/sdk/` — Empty directory with only `.gitkeep`. No `package.json`, no source files.
- `packages/database/` — Prisma schema includes `ProjectApiKey` model with `keyHash`, `prefix`, `revokedAt` fields (from US-012/013). The SDK will eventually send the raw API key in requests; credential validation happens server-side at the ingestion boundary.
- `apps/api/` — Has `ApiKeysModule` (US-012/013) for credential generation. No ingestion endpoint yet (that's US-021+).
- `apps/ingestion/` — Empty directory with `.gitkeep`. The ingestion Lambda is a future story.
- `packages/contracts/` — Empty directory. Could house shared event types but no content yet.
- Monorepo: pnpm workspaces with `packages/*` and `apps/*` globs. TypeScript, ESM throughout.

## Dependencies

- **Upstream:** US-012 (Generate a tracking credential) — Done. The SDK uses the API key generated there.
- **Downstream:** US-015 (Track a product event), US-016 (Identify a user), US-017 (Track page views), US-018 (Reset user identity), US-019 (Batch and flush events), US-020 (Respect tracking consent) — all depend on the SDK being initialized.

## Implementation subtasks

### 1. Package scaffolding (`packages/sdk`)

- [x] Create `packages/sdk/package.json`:
  - Name: `@userpulse/sdk`
  - Version: `0.1.0`
  - Type: `module` (ESM)
  - Entry: `dist/index.js` (types: `dist/index.d.ts`)
  - Scripts: `build` (tsc), `test` (vitest), `typecheck` (tsc --noEmit), `lint` (oxlint)
  - No runtime dependencies
  - Dev dependencies: `typescript`, `vitest`
- [x] Create `packages/sdk/tsconfig.json`:
  - Target: ES2022, module: NodeNext, moduleResolution: NodeNext
  - Declaration: true, outDir: dist, rootDir: src
  - Strict mode enabled
- [x] Create `packages/sdk/vitest.config.ts` matching the project's existing vitest patterns.

### 2. SDK core types (`packages/sdk/src/types.ts`)

- [x] Define `UserpulseConfig` interface:
  ```typescript
  interface UserpulseConfig {
    apiKey: string;
    endpoint?: string;       // default: 'https://api.userpulse.dev/v1/events'
    flushInterval?: number;  // ms, default: 30000
    maxQueueSize?: number;   // default: 100
    debug?: boolean;         // default: false
  }
  ```
- [x] Define `UserpulseEvent` interface (skeleton for US-015+):
  ```typescript
  interface UserpulseEvent {
    eventId: string;
    eventName: string;
    timestamp: string;
    anonymousId: string;
    userId?: string;
    sessionId?: string;
    properties?: Record<string, unknown>;
    pageName?: string;
    pagePath?: string;
    sdkVersion: string;
  }
  ```
- [x] Define `UserpulseInstance` interface with the public API surface:
  ```typescript
  interface UserpulseInstance {
    readonly config: Readonly<UserpulseConfig>;
    readonly anonymousId: string;
    readonly sdkVersion: string;
    readonly isInitialized: boolean;
  }
  ```

### 3. SDK initialization (`packages/sdk/src/client.ts`)

- [x] Implement `UserpulseClient` class (internal):
  - Constructor validates config: `apiKey` must be a non-empty string (throw `Error('UserpulseSDK: apiKey is required')` if missing/empty).
  - Stores resolved config with defaults applied.
  - Generates `anonymousId`: UUID v4 using `crypto.randomUUID()` (available in modern browsers and Node 19+). Persist to `localStorage` under key `userpulse_anonymous_id` if available (try/catch for SSR/Node).
  - Initializes empty event queue (`UserpulseEvent[]`) with max size from config.
  - Sets `isInitialized = true`.
  - All initialization is synchronous. No network calls during init.
- [x] Embed `sdkVersion` from package.json version at build time (use a simple `version.ts` generated by build script, or inline the version string directly — keep it simple).

### 4. SDK entry point (`packages/sdk/src/index.ts`)

- [x] Export `init(config: UserpulseConfig): UserpulseInstance` function:
  - Creates a `UserpulseClient` instance.
  - Stores it as the module-level singleton.
  - Returns the instance (typed as `UserpulseInstance`).
  - Calling `init()` again replaces the previous instance (with a debug warning if `debug: true`).
- [x] Export `getClient(): UserpulseInstance` function:
  - Returns the current instance or throws `Error('UserpulseSDK: Not initialized. Call init() first.')`.
- [x] Export types: `UserpulseConfig`, `UserpulseEvent`, `UserpulseInstance`.
- [x] Export `SDK_VERSION` constant.

### 5. README (`packages/sdk/README.md`)

- [x] Write installation instructions:
  ```
  npm install @userpulse/sdk
  # or
  pnpm add @userpulse/sdk
  ```
- [x] Write initialization example:
  ```typescript
  import { init } from '@userpulse/sdk';

  const up = init({
    apiKey: 'your-project-api-key',
  });
  ```
- [x] Document configuration options (apiKey, endpoint, flushInterval, maxQueueSize, debug).
- [x] Note that the API key is obtained from the project settings page (US-012).
- [x] Note that initialization is synchronous and non-blocking.

### 6. Tests (`packages/sdk/src/__tests__/`)

- [x] `init.test.ts`:
  - `init()` with valid apiKey returns an instance with `isInitialized: true`.
  - `init()` with missing apiKey throws with clear message.
  - `init()` with empty string apiKey throws with clear message.
  - `init()` applies default config values (endpoint, flushInterval, maxQueueSize).
  - `init()` with custom config values preserves them.
  - `init()` generates an `anonymousId` (UUID format).
  - `init()` sets `sdkVersion` to a non-empty string.
  - `getClient()` before `init()` throws with clear message.
  - `getClient()` after `init()` returns the same instance.
  - Calling `init()` twice replaces the instance.
  - Initialization is synchronous (no promises/callbacks).

### 7. Build verification

- [x] `pnpm --filter @userpulse/sdk build` succeeds and produces `dist/` with `.js` and `.d.ts` files.
- [x] `pnpm --filter @userpulse/sdk test` — 14 tests passed.
- [x] `pnpm --filter @userpulse/sdk typecheck` — no type errors.
- [x] `pnpm build` — full monorepo build succeeds.
- [x] `pnpm lint` — no lint errors (warnings in API are pre-existing).
- [x] `pnpm typecheck` — no type errors across workspace.

## Verification

Run these commands and record outcomes:

1. `pnpm --filter @userpulse/sdk test` — all unit tests pass.
2. `pnpm --filter @userpulse/sdk build` — produces dist with JS + declarations.
3. `pnpm --filter @userpulse/sdk typecheck` — clean.
4. `pnpm build` — full workspace build passes.
5. `pnpm lint` — clean.
6. `pnpm typecheck` — clean.
7. `pnpm format:check` — clean.

## Definition of Done

- [x] All acceptance criteria are met.
- [x] The SDK package builds and exports correctly.
- [x] Unit tests cover initialization happy paths and error cases.
- [x] README with installation and initialization instructions exists.
- [x] SDK version is embedded and accessible.
- [x] No security issues (no credentials stored, no sensitive data collected).
- [x] Full workspace build, lint, typecheck, and format pass.
- [x] Progress.md and task file updated.

## Assumptions / open questions

- **Default endpoint:** Using `https://api.userpulse.dev/v1/events` as placeholder. The actual ingestion endpoint will be determined in US-021. The SDK will allow overriding this.
- **UUID generation:** Using `crypto.randomUUID()` which is available in all modern browsers and Node 19+. No polyfill needed for the MVP target.
- **localStorage:** Used for anonymous ID persistence in browsers. Wrapped in try/catch for environments where it's unavailable (SSR, incognito in some contexts). Falls back to in-memory only.
- **No network calls at init:** The SDK does not validate the API key against the server during initialization. Key validation happens at the ingestion boundary (US-021+).
