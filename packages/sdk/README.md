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

### `getClient(): UserpulseInstance`

Returns the current SDK instance. Throws if `init()` has not been called.

### `SDK_VERSION`

The SDK version string constant.
