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
| `trackingEnabled` | `boolean` | `true` | Set to `false` to disable event tracking (respects user consent). |

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

Each event is assigned a unique `eventId`, an ISO 8601 `timestamp`, and the current `anonymousId`. Events are queued locally and flushed automatically (see [Batching and flushing](#batching-and-flushing)).

If called before `init()`, with an invalid event name, or when the queue is full, the call is silently ignored (no error thrown). Enable `debug: true` to see warnings in the console.

### `page(name?: string, properties?: Record<string, unknown>): void`

Record a page or screen view.

```typescript
import { page } from '@userpulse/sdk';

// Page with name
page('Home');

// Page with name and properties
page('Product', { path: '/products/123', category: 'electronics' });

// Page with properties only
page(undefined, { path: '/dashboard' });
```

- `name` — Optional page or screen name (e.g. `"Home"`, `"Product Detail"`).
- `properties` — Optional structured data attached to the event (e.g. `path`, `referrer`, `title`).

Page events use the reserved event name `$page` and follow the standard event contract: `eventId`, `timestamp`, `anonymousId`, `userId` (if identified), and `sdkVersion`.

**Privacy:** The SDK does **not** automatically collect `window.location`, `document.title`, query parameters, or any other browser globals. The developer explicitly passes only the page data they intend to track. This prevents accidental collection of sensitive URL parameters (tokens, session IDs, PII in query strings).

### `identify(userId: string, traits?: Record<string, unknown>): void`

Associate subsequent events with a known user.

```typescript
import { identify } from '@userpulse/sdk';

identify('user-123', { plan: 'pro', name: 'Alice' });
```

- `userId` — A non-empty string: the customer's own user identifier. Email or other personal information is not required.
- `traits` — Optional user attributes (e.g. name, plan, company). Stored on the client for future use.

After calling `identify()`, all subsequent `track()` events include the `userId`. The `anonymousId` is preserved alongside it, enabling the platform to link anonymous pre-login activity to the identified user.

### `reset(): void`

Clear the current identity and generate a fresh anonymous ID. Use this when a user logs out.

```typescript
import { reset } from '@userpulse/sdk';

reset();
```

After `reset()`, the `userId` is cleared, a new `anonymousId` is generated, and subsequent events are anonymous again. This prevents data leakage between users on a shared device.

#### Anonymous-to-identified behavior

1. **Before `identify()`:** Events carry only `anonymousId`. Each browser/device gets a stable anonymous ID persisted in `localStorage`.
2. **After `identify(userId)`:** Events carry both `anonymousId` and `userId`. The platform can link the anonymous history to the identified user.
3. **After `reset()`:** The `userId` is cleared and a fresh `anonymousId` is generated. The user is anonymous again.

### `flush(): Promise<void>`

Send all queued events to the server immediately.

```typescript
import { flush } from '@userpulse/sdk';

await flush();
```

Normally you don't need to call this — the SDK flushes automatically on a timer and when the queue reaches half capacity. Use `flush()` when you need to guarantee delivery before a specific point (e.g. before navigating away in a single-page app).

If the network request fails, events are returned to the queue and retried on the next flush. `flush()` never throws.

### `destroy(): void`

Stop the SDK, clear the auto-flush timer, and send any remaining events.

```typescript
import { destroy } from '@userpulse/sdk';

destroy();
```

Call this when your application is shutting down or when the SDK is no longer needed. After `destroy()`, calling other SDK methods will log a warning.

### `setTrackingEnabled(enabled: boolean): void`

Enable or disable event tracking at runtime. Use this to respect the user's consent decision from your consent management platform (cookie banner, CMP, etc.).

```typescript
import { setTrackingEnabled } from '@userpulse/sdk';

// User declines tracking
setTrackingEnabled(false);

// User grants consent
setTrackingEnabled(true);
```

When tracking is disabled:
- `track()` and `page()` silently discard events (nothing is queued).
- `flush()` is a no-op (queued events from before the change are not sent).
- `identify()` and `reset()` still work — they manage local identity state and do not send events.

When tracking is re-enabled, subsequent `track()` and `page()` calls resume normal behavior.

The SDK does not persist consent state. Your application is responsible for storing the user's consent decision and passing it via `init({ trackingEnabled })` or `setTrackingEnabled()` on each page load.

### `getClient(): UserpulseInstance`

Returns the current SDK instance. Throws if `init()` has not been called.

### `SDK_VERSION`

The SDK version string constant.

## Batching and flushing

Events are buffered in memory and sent to the server in batches:

- **Auto-flush on timer:** Events are flushed every `flushInterval` milliseconds (default: 30 seconds).
- **Auto-flush on threshold:** When the queue reaches half of `maxQueueSize` (default: 50 events), a flush is triggered automatically.
- **Page lifecycle:** In browsers, the SDK flushes on `beforeunload` and `visibilitychange` (tab hidden) to minimize data loss on navigation.
- **Queue limit:** The queue holds at most `maxQueueSize` events. Events tracked when the queue is full are silently dropped.
- **Network failures:** If a flush fails (network error or non-2xx response), events are returned to the queue and retried on the next flush. Failures never throw or block the application.
- **Explicit flush:** Call `flush()` to send events immediately.
- **Cleanup:** Call `destroy()` to stop the timer and send remaining events.

## Event deduplication

Each event is assigned a unique `eventId` (UUID) when `track()` or `page()` is called. If a flush fails and the events are retried, the same `eventId` is resent. The server deduplicates by `(projectId, eventId)` — duplicate submissions are silently skipped and do not inflate metrics.

**Guarantees:**
- Each `eventId` is stored at most once per project.
- Retries from network failures do not create duplicate events.

**Limitations:**
- `eventId` is generated in memory. If the SDK is re-initialized (e.g., full page reload) before events are flushed, unflushed events are lost and new UUIDs are generated for subsequent events.
- Deduplication is scoped to a single project. The same `eventId` in different projects is treated as distinct events.
