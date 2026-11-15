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
  userId?: string;
  readonly sdkVersion: string = SDK_VERSION;
  readonly isInitialized: boolean = true;

  /** @internal */
  traits?: Record<string, unknown>;

  /** @internal */
  readonly queue: UserpulseEvent[] = [];

  /** @internal */
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /** @internal */
  private flushing: boolean = false;

  /** @internal */
  private boundBeforeUnload: (() => void) | null = null;

  /** @internal */
  private boundVisibilityChange: (() => void) | null = null;

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

    this.startAutoFlush();
    this.addLifecycleListeners();
  }

  track(eventName: string, properties?: Record<string, unknown>): void {
    try {
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
        ...(this.userId !== undefined && { userId: this.userId }),
        sdkVersion: this.sdkVersion,
        ...(properties !== undefined && { properties }),
      };

      this.queue.push(event);
      this.flushIfNeeded();
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in track().');
      }
    }
  }

  page(name?: string, properties?: Record<string, unknown>): void {
    try {
      if (this.queue.length >= this.config.maxQueueSize) {
        if (this.config.debug) {
          console.warn('UserpulseSDK: Event queue is full. Event dropped.');
        }
        return;
      }

      const mergedProperties: Record<string, unknown> = {
        ...(typeof name === 'string' && name.trim() !== '' ? { name } : {}),
        ...properties,
      };

      const event: UserpulseEvent = {
        eventId: generateUUID(),
        eventName: '$page',
        timestamp: new Date().toISOString(),
        anonymousId: this.anonymousId,
        ...(this.userId !== undefined && { userId: this.userId }),
        sdkVersion: this.sdkVersion,
        ...(Object.keys(mergedProperties).length > 0 && { properties: mergedProperties }),
      };

      this.queue.push(event);
      this.flushIfNeeded();
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in page().');
      }
    }
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    try {
      if (typeof userId !== 'string' || userId.trim() === '') {
        if (this.config.debug) {
          console.warn('UserpulseSDK: identify() requires a non-empty user ID.');
        }
        return;
      }

      this.userId = userId;
      this.traits = traits;
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in identify().');
      }
    }
  }

  reset(): void {
    try {
      this.userId = undefined;
      this.traits = undefined;
      this.anonymousId = generateUUID();
      persistAnonymousId(this.anonymousId);
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in reset().');
      }
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0 || this.flushing) {
      return;
    }

    this.flushing = true;
    try {
      const batch = this.queue.splice(0, this.queue.length);

      try {
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({ batch }),
          keepalive: true,
        });

        if (!response.ok) {
          this.requeueEvents(batch);
          if (this.config.debug) {
            console.warn(`UserpulseSDK: Flush failed with status ${response.status}.`);
          }
        }
      } catch {
        this.requeueEvents(batch);
        if (this.config.debug) {
          console.warn('UserpulseSDK: Flush failed due to a network error.');
        }
      }
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in flush().');
      }
    } finally {
      this.flushing = false;
    }
  }

  destroy(): void {
    try {
      this.stopAutoFlush();
      this.removeLifecycleListeners();
      void this.flush();
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in destroy().');
      }
    }
  }

  /** @internal */
  private requeueEvents(events: UserpulseEvent[]): void {
    const available = this.config.maxQueueSize - this.queue.length;
    if (available > 0) {
      const toRequeue = events.slice(0, available);
      this.queue.unshift(...toRequeue);
    }
  }

  /** @internal */
  private flushIfNeeded(): void {
    const threshold = Math.max(1, Math.floor(this.config.maxQueueSize / 2));
    if (this.queue.length >= threshold) {
      void this.flush();
    }
  }

  /** @internal */
  private startAutoFlush(): void {
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, this.config.flushInterval);
    }
  }

  /** @internal */
  private stopAutoFlush(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** @internal */
  private addLifecycleListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.boundBeforeUnload = () => {
      void this.flush();
    };
    this.boundVisibilityChange = () => {
      if (document.hidden) {
        void this.flush();
      }
    };

    window.addEventListener('beforeunload', this.boundBeforeUnload);
    document.addEventListener('visibilitychange', this.boundVisibilityChange);
  }

  /** @internal */
  private removeLifecycleListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    if (this.boundBeforeUnload) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.boundBeforeUnload = null;
    }
    if (this.boundVisibilityChange) {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
      this.boundVisibilityChange = null;
    }
  }
}
