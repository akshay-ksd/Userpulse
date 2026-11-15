import type { EventDto } from './ingestion.dto.js';

export const MAX_EVENT_NAME_LENGTH = 200;
export const MAX_PROPERTY_KEYS = 50;
export const MAX_PROPERTIES_BYTES = 8192;
export const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

export type ValidationErrorCode =
  | 'event_name_empty'
  | 'event_name_invalid_characters'
  | 'timestamp_invalid'
  | 'timestamp_in_future'
  | 'identity_missing'
  | 'properties_too_many_keys'
  | 'properties_too_large';

export interface NormalizedEvent extends EventDto {
  organizationId: string;
  projectId: string;
  ingestedAt: string;
}

export interface InvalidEvent {
  eventId: string;
  errors: ValidationErrorCode[];
}

export interface ValidationResult {
  valid: NormalizedEvent[];
  invalid: InvalidEvent[];
}

const CONTROL_CHARACTERS = /\p{Cc}/u;

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

/**
 * Tenant identifiers come only from the authenticated API key; normalized
 * events are rebuilt from known fields so payload values can never override them.
 */
export function validateAndNormalize(
  events: EventDto[],
  organizationId: string,
  projectId: string,
  now: Date = new Date(),
): ValidationResult {
  const ingestedAt = now.toISOString();
  const valid: NormalizedEvent[] = [];
  const invalid: InvalidEvent[] = [];

  for (const event of events) {
    const errors: ValidationErrorCode[] = [];

    const eventName = event.eventName.trim();
    if (!eventName) {
      errors.push('event_name_empty');
    } else if (CONTROL_CHARACTERS.test(eventName)) {
      errors.push('event_name_invalid_characters');
    }

    const time = new Date(event.timestamp).getTime();
    if (Number.isNaN(time)) {
      errors.push('timestamp_invalid');
    } else if (time - now.getTime() > MAX_FUTURE_SKEW_MS) {
      errors.push('timestamp_in_future');
    }

    const anonymousId = trimmed(event.anonymousId);
    const userId = trimmed(event.userId);
    if (!anonymousId && !userId) {
      errors.push('identity_missing');
    }

    if (event.properties) {
      if (Object.keys(event.properties).length > MAX_PROPERTY_KEYS) {
        errors.push('properties_too_many_keys');
      }
      if (
        Buffer.byteLength(JSON.stringify(event.properties), 'utf8') >
        MAX_PROPERTIES_BYTES
      ) {
        errors.push('properties_too_large');
      }
    }

    if (errors.length > 0) {
      invalid.push({ eventId: event.eventId, errors });
      continue;
    }

    const sessionId = trimmed(event.sessionId);
    const pageName = trimmed(event.pageName);
    const pagePath = trimmed(event.pagePath);
    const sdkVersion = trimmed(event.sdkVersion);

    valid.push({
      eventId: event.eventId,
      eventName,
      timestamp: new Date(time).toISOString(),
      ...(anonymousId && { anonymousId }),
      ...(userId && { userId }),
      ...(sessionId && { sessionId }),
      ...(event.properties && { properties: event.properties }),
      ...(pageName && { pageName }),
      ...(pagePath && { pagePath }),
      ...(sdkVersion && { sdkVersion }),
      organizationId,
      projectId,
      ingestedAt,
    });
  }

  return { valid, invalid };
}
