export interface UserpulseConfig {
  apiKey: string;
  endpoint?: string;
  flushInterval?: number;
  maxQueueSize?: number;
  debug?: boolean;
  trackingEnabled?: boolean;
}

export interface ResolvedConfig {
  apiKey: string;
  endpoint: string;
  flushInterval: number;
  maxQueueSize: number;
  debug: boolean;
  trackingEnabled: boolean;
}

export interface TrackOptions {
  description?: string;
  featureName?: string;
  properties?: Record<string, unknown>;
}

export interface UserpulseEvent {
  eventId: string;
  eventName: string;
  timestamp: string;
  anonymousId: string;
  userId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
  description?: string;
  featureName?: string;
  pageName?: string;
  pagePath?: string;
  sdkVersion: string;
}

export interface UserpulseInstance {
  readonly config: Readonly<ResolvedConfig>;
  readonly anonymousId: string;
  readonly userId?: string;
  readonly sdkVersion: string;
  readonly isInitialized: boolean;
  readonly trackingEnabled: boolean;
  track(eventName: string, propertiesOrOptions?: Record<string, unknown> | TrackOptions): void;
  page(name?: string, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  reset(): void;
  flush(): Promise<void>;
  destroy(): void;
  setTrackingEnabled(enabled: boolean): void;
}
