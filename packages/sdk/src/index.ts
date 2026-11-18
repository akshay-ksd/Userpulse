import type { UserpulseConfig, UserpulseInstance } from './types.js';
import { UserpulseClient } from './client.js';

export type {
  UserpulseConfig,
  UserpulseEvent,
  UserpulseInstance,
  ResolvedConfig,
} from './types.js';
export { SDK_VERSION } from './version.js';

let currentClient: UserpulseClient | null = null;

export function init(config: UserpulseConfig): UserpulseInstance {
  if (currentClient && currentClient.config.debug) {
    console.warn('UserpulseSDK: Re-initializing. Previous instance will be replaced.');
  }

  currentClient = new UserpulseClient(config);
  return currentClient;
}

export function getClient(): UserpulseInstance {
  if (!currentClient) {
    throw new Error('UserpulseSDK: Not initialized. Call init() first.');
  }
  return currentClient;
}

export function track(eventName: string, properties?: Record<string, unknown>): void {
  if (!currentClient) {
    console.warn('UserpulseSDK: Not initialized. Call init() before track().');
    return;
  }
  currentClient.track(eventName, properties);
}

export function page(name?: string, properties?: Record<string, unknown>): void {
  if (!currentClient) {
    console.warn('UserpulseSDK: Not initialized. Call init() before page().');
    return;
  }
  currentClient.page(name, properties);
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  if (!currentClient) {
    console.warn('UserpulseSDK: Not initialized. Call init() before identify().');
    return;
  }
  currentClient.identify(userId, traits);
}

export function reset(): void {
  if (!currentClient) {
    console.warn('UserpulseSDK: Not initialized. Call init() before reset().');
    return;
  }
  currentClient.reset();
}

export async function flush(): Promise<void> {
  if (!currentClient) {
    console.warn('UserpulseSDK: Not initialized. Call init() before flush().');
    return;
  }
  await currentClient.flush();
}

export function destroy(): void {
  if (!currentClient) {
    return;
  }
  currentClient.destroy();
  currentClient = null;
}

export function setTrackingEnabled(enabled: boolean): void {
  if (!currentClient) {
    console.warn('UserpulseSDK: Not initialized. Call init() before setTrackingEnabled().');
    return;
  }
  currentClient.setTrackingEnabled(enabled);
}

/** @internal — reset module state for tests */
export function _reset(): void {
  if (currentClient) {
    currentClient.destroy();
  }
  currentClient = null;
}
