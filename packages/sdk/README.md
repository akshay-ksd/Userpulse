# @userpulse/sdk

Lightweight tracking SDK for the Userpulse product intelligence platform.

## Installation

```bash
npm install @userpulse/sdk
# or
pnpm add @userpulse/sdk
```

## Quick Start

```typescript
import { init } from '@userpulse/sdk';

const up = init({
  apiKey: 'your-project-api-key',
});
```

The API key is generated from your project settings page. See [Generate a tracking credential](../../harness/user-stories.md) (US-012).

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | **(required)** | Your project tracking API key. |
| `endpoint` | `string` | `https://api.userpulse.dev/v1/events` | Event ingestion endpoint URL. |
| `flushInterval` | `number` | `30000` | Interval in milliseconds between automatic event flushes. |
| `maxQueueSize` | `number` | `100` | Maximum number of events to buffer before flushing. |
| `debug` | `boolean` | `false` | Enable debug logging to the console. |

## Behavior

- **Synchronous initialization:** `init()` returns immediately and does not make any network requests. Your application is never blocked by the SDK during startup.
- **Anonymous ID:** On first initialization, a random anonymous ID (UUID v4) is generated and persisted to `localStorage` (browsers) for cross-session continuity. In server-side or restricted environments, the ID is held in memory only.
- **SDK version:** Every event includes an `sdkVersion` field for debugging and compatibility tracking.
- **Invalid configuration:** Calling `init()` without an `apiKey` throws an error immediately, so misconfiguration is caught during development.

## API

### `init(config: UserpulseConfig): UserpulseInstance`

Initialize the SDK with the given configuration. Returns an instance with:

- `config` — Resolved configuration with defaults applied.
- `anonymousId` — The anonymous identifier for this device/browser.
- `sdkVersion` — The SDK version string.
- `isInitialized` — Always `true` after successful initialization.

### `track(eventName: string, properties?: Record<string, unknown>): void`

Record a named product event.

```typescript
import { track } from '@userpulse/sdk';

track('button_clicked', { buttonId: 'signup-cta', page: '/home' });
```

- `eventName` — A non-empty string identifying the action (e.g. `"signup"`, `"purchase"`, `"feature_used"`).
- `properties` — Optional structured data attached to the event.

Each event is assigned a unique `eventId`, an ISO 8601 `timestamp`, and the current `anonymousId`. Events are queued locally and flushed automatically (see **Flushing** below).

If called before `init()`, with an invalid event name, or when the queue is full, the call is silently ignored (no error thrown). Enable `debug: true` to see warnings in the console.

### `identify(userId: string, traits?: Record<string, unknown>): void`

Associate subsequent events with a known user.

```typescript
import { identify } from '@userpulse/sdk';

identify('user-123', { name: 'Jane', plan: 'pro' });
```

- `userId` — A non-empty string that is your application's stable user identifier (e.g. internal user ID, username). Email or other personal information is not required.
- `traits` — Optional user properties (name, plan, company, etc.) stored for future use.

After calling `identify()`, all subsequent `track()` events include the `userId` alongside the `anonymousId`. This allows the analytics system to link anonymous pre-login activity with identified post-login activity.

**Anonymous-to-identified behavior:**
- Before `identify()`: events carry only `anonymousId`.
- After `identify()`: events carry both `anonymousId` and `userId`.
- The `anonymousId` is preserved across identity changes, enabling session stitching.
- Calling `identify()` again with a different `userId` replaces the current identity.
- To fully reset identity (including `anonymousId`), use `reset()` — see below.

If called before `init()`, with an invalid userId, or if an unexpected error occurs, the call is silently ignored. Enable `debug: true` to see warnings.

### `page(name?: string, properties?: Record<string, unknown>): void`

Record a page or screen view.

```typescript
import { page } from '@userpulse/sdk';

page('Settings', { path: '/settings', section: 'billing' });
```

- `name` — Optional page or screen name (e.g. `"Home"`, `"Settings"`, `"User Profile"`).
- `properties` — Optional structured data. If `path` is provided, it is extracted to a top-level `pagePath` field for consistent querying.

Each page event is created with `eventName: '$page'` and follows the standard event contract (`eventId`, `timestamp`, `anonymousId`, `sdkVersion`). If an identity has been set via `identify()`, the `userId` is included.

**Privacy:** The SDK does not automatically collect the browser URL, query parameters, referrer, or page content. Only the data you explicitly pass is recorded.

If called before `init()` or when the queue is full, the call is silently ignored. Enable `debug: true` to see warnings.

### `reset(): void`

Reset the active identity. Call this when the user signs out of your application.

```typescript
import { reset } from '@userpulse/sdk';

reset();
```

`reset()` performs a full identity reset:
- Clears the `userId` set by `identify()`.
- Clears any stored user traits.
- Generates a new `anonymousId` so that subsequent events are not linked to the previous user.

After `reset()`, events carry only the new `anonymousId` — no `userId` is included until `identify()` is called again. Previously queued events are not affected; they retain the identity they were recorded with.

If called before `init()` or if an unexpected error occurs, the call is silently ignored. Enable `debug: true` to see warnings.

### `flush(): Promise<void>`

Explicitly flush all queued events to the server.

```typescript
import { flush } from '@userpulse/sdk';

await flush();
```

Returns a Promise that resolves when the batch has been sent (or silently fails on network error). The queue is cleared regardless of success.

### `destroy(): void`

Stop the SDK and release resources.

```typescript
import { destroy } from '@userpulse/sdk';

destroy();
```

`destroy()` stops the automatic flush timer, removes the page-unload listener, and triggers a final flush of any remaining events. After `destroy()`, calls to `track()` and `page()` are silently ignored.

## Flushing

Events are buffered in an in-memory queue and sent to the server in batches:

- **Automatic interval:** Every `flushInterval` ms (default 30 seconds), the queue is flushed.
- **Page unload:** In browsers, queued events are sent using `navigator.sendBeacon()` when the page becomes hidden (`visibilitychange` event), providing best-effort delivery on navigation or tab close.
- **Explicit:** Call `flush()` to send events immediately.
- **On destroy:** `destroy()` triggers a final flush.

Network failures are caught silently — the SDK never throws or blocks your application. Failed batches are discarded (no retry). Enable `debug: true` to see flush warnings in the console.

### `getClient(): UserpulseInstance`

Returns the current SDK instance. Throws if `init()` has not been called.

### `SDK_VERSION`

The SDK version string constant.
