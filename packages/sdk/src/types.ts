export interface UserpulseConfig {
  apiKey: string;
  endpoint?: string;
  flushInterval?: number;
  maxQueueSize?: number;
  debug?: boolean;
}

export interface ResolvedConfig {
  apiKey: string;
  endpoint: string;
  flushInterval: number;
  maxQueueSize: number;
  debug: boolean;
}

export interface UserpulseEvent {
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

export interface UserpulseInstance {
  readonly config: Readonly<ResolvedConfig>;
  readonly anonymousId: string;
  readonly sdkVersion: string;
  readonly isInitialized: boolean;
}
