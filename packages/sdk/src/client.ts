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
  readonly anonymousId: string;
  readonly sdkVersion: string = SDK_VERSION;
  readonly isInitialized: boolean = true;

  /** @internal */
  readonly queue: UserpulseEvent[] = [];

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
        sdkVersion: this.sdkVersion,
        ...(properties !== undefined && { properties }),
      };

      this.queue.push(event);
    } catch {
      if (this.config.debug) {
        console.warn('UserpulseSDK: Unexpected error in track().');
      }
    }
  }
}
