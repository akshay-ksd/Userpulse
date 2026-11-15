import type {
  UserpulseConfig,
  ResolvedConfig,
  UserpulseEvent,
  UserpulseInstance,
} from './types.js';
import { SDK_VERSION } from './version.js';

const DEFAULT_ENDPOINT = 'https://api.userpulse.dev/v1/events';
const DEFAULT_FLUSH_INTERVAL = 30_000;
const DEFAULT_MAX_QUEUE_SIZE = 100;
const ANONYMOUS_ID_KEY = 'userpulse_anonymous_id';

function generateUUID(): string {
  return crypto.randomUUID();
}

function loadAnonymousId(): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(ANONYMOUS_ID_KEY);
    }
  } catch {
    // localStorage unavailable (SSR, restricted context)
  }
  return null;
}

function persistAnonymousId(id: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ANONYMOUS_ID_KEY, id);
    }
  } catch {
    // localStorage unavailable
  }
}

function resolveConfig(config: UserpulseConfig): ResolvedConfig {
  return {
    apiKey: config.apiKey,
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    flushInterval: config.flushInterval ?? DEFAULT_FLUSH_INTERVAL,
    maxQueueSize: config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
    debug: config.debug ?? false,
  };
}

export class UserpulseClient implements UserpulseInstance {
  readonly config: Readonly<ResolvedConfig>;
  anonymousId: string;
  readonly sdkVersion: string = SDK_VERSION;
  readonly isInitialized: boolean = true;
  userId: string | null = null;

  /** @internal */
  userTraits: Record<string, unknown> | null = null;

  /** @internal */
  readonly queue: UserpulseEvent[] = [];

  /** @internal */
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /** @internal */
  private destroyed = false;

  /** @internal */
  private visibilityHandler: (() => void) | null = null;

  /** @internal — typed references for browser globals */
  private static get doc():
    | { visibilityState: string; addEventListener: Function; removeEventListener: Function }
    | undefined {
    return typeof globalThis !== 'undefined' && 'document' in globalThis
      ? ((globalThis as Record<string, unknown>).document as {
          visibilityState: string;
          addEventListener: Function;
          removeEventListener: Function;
        })
      : undefined;
  }

  private static get nav(): { sendBeacon?: (url: string, data: unknown) => boolean } | undefined {
    return typeof globalThis !== 'undefined' && 'navigator' in globalThis
      ? ((globalThis as Record<string, unknown>).navigator as {
          sendBeacon?: (url: string, data: unknown) => boolean;
        })
      : undefined;
  }

  constructor(userConfig: UserpulseConfig) {
    if (!userConfig || typeof userConfig.apiKey !== 'string' || userConfig.apiKey.trim() === '') {
      throw new Error('UserpulseSDK: apiKey is required');
    }

    this.config = Object.freeze(resolveConfig(userConfig));

    const existing = loadAnonymousId();
    if (existing) {
      this.anonymousId = existing;
    } else {
      this.anonymousId = generateUUID();
      persistAnonymousId(this.anonymousId);
    }

    this.startFlushTimer();
    this.addUnloadHandler();
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    try {
      if (typeof userId !== 'string' || userId.trim() === '') {
        if (this.config.debug) {
          console.warn('UserpulseSDK: identify() requires a non-empty userId.');
        }
        return;
      }

      this.userId = userId;
      if (traits !== undefined) {
        this.userTraits = traits;
      }
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in identify().');
      }
    }
  }

  track(eventName: string, properties?: Record<string, unknown>): void {
    try {
      if (this.destroyed) return;

      if (typeof eventName !== 'string' || eventName.trim() === '') {
        if (this.config.debug) {
          console.warn('UserpulseSDK: track() requires a non-empty event name.');
        }
        return;
      }

      if (this.queue.length >= this.config.maxQueueSize) {
        if (this.config.debug) {
          console.warn('UserpulseSDK: Event queue is full. Event dropped.');
        }
        return;
      }

      const event: UserpulseEvent = {
        eventId: generateUUID(),
        eventName,
        timestamp: new Date().toISOString(),
        anonymousId: this.anonymousId,
        sdkVersion: this.sdkVersion,
        ...(this.userId !== null && { userId: this.userId }),
        ...(properties !== undefined && { properties }),
      };

      this.queue.push(event);
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in track().');
      }
    }
  }

  page(name?: string, properties?: Record<string, unknown>): void {
    try {
      if (this.destroyed) return;

      if (this.queue.length >= this.config.maxQueueSize) {
        if (this.config.debug) {
          console.warn('UserpulseSDK: Event queue is full. Event dropped.');
        }
        return;
      }

      let pagePath: string | undefined;
      let remainingProperties: Record<string, unknown> | undefined;

      if (properties !== undefined) {
        const { path, ...rest } = properties;
        if (typeof path === 'string') {
          pagePath = path;
        }
        if (Object.keys(rest).length > 0) {
          remainingProperties = rest;
        }
      }

      const event: UserpulseEvent = {
        eventId: generateUUID(),
        eventName: '$page',
        timestamp: new Date().toISOString(),
        anonymousId: this.anonymousId,
        sdkVersion: this.sdkVersion,
        ...(this.userId !== null && { userId: this.userId }),
        ...(typeof name === 'string' && name.trim() !== '' && { pageName: name }),
        ...(pagePath !== undefined && { pagePath }),
        ...(remainingProperties !== undefined && { properties: remainingProperties }),
      };

      this.queue.push(event);
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in page().');
      }
    }
  }

  reset(): void {
    try {
      this.userId = null;
      this.userTraits = null;
      this.anonymousId = generateUUID();
      persistAnonymousId(this.anonymousId);
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in reset().');
      }
    }
  }

  async flush(): Promise<void> {
    try {
      if (this.queue.length === 0) return;

      const batch = this.queue.splice(0, this.queue.length);

      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ batch }),
      });
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Failed to flush events.');
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopFlushTimer();
    this.removeUnloadHandler();
    this.flush();
  }

  /** @internal */
  private startFlushTimer(): void {
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushInterval);
    }
  }

  /** @internal */
  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** @internal */
  private addUnloadHandler(): void {
    try {
      const doc = UserpulseClient.doc;
      if (doc) {
        this.visibilityHandler = () => {
          if (doc.visibilityState === 'hidden') {
            this.flushSync();
          }
        };
        doc.addEventListener('visibilitychange', this.visibilityHandler);
      }
    } catch {
      // Not in a browser environment
    }
  }

  /** @internal */
  private removeUnloadHandler(): void {
    try {
      const doc = UserpulseClient.doc;
      if (this.visibilityHandler && doc) {
        doc.removeEventListener('visibilitychange', this.visibilityHandler);
        this.visibilityHandler = null;
      }
    } catch {
      // Not in a browser environment
    }
  }

  /** @internal — synchronous best-effort flush using sendBeacon */
  private flushSync(): void {
    try {
      if (this.queue.length === 0) return;

      const batch = this.queue.splice(0, this.queue.length);
      const payload = JSON.stringify({ batch });

      const nav = UserpulseClient.nav;
      if (nav && typeof nav.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        nav.sendBeacon(this.config.endpoint, blob);
      } else if (typeof fetch !== 'undefined') {
        fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Failed to flush events on page unload.');
      }
    }
  }
}
