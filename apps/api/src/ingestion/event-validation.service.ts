import { Injectable } from '@nestjs/common';
import type { EventDto } from './submit-events.dto.js';

export interface NormalizedEvent {
  eventId: string;
  eventName: string;
  timestamp: string;
  anonymousId?: string;
  userId?: string;
  properties?: Record<string, unknown>;
  sdkVersion?: string;
}

export interface ValidationResult {
  normalized: NormalizedEvent;
  status: 'VALID' | 'REJECTED';
  error?: string;
}

const MAX_PROPERTIES_SIZE = 32_768;
const MAX_NESTING_DEPTH = 5;
const MAX_FUTURE_MS = 3_600_000;
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const STRIPPED_PROPERTY_KEYS = new Set([
  'organizationId',
  'projectId',
  'apiKey',
  'apikey',
  'api_key',
]);

function checkNestingDepth(
  value: unknown,
  currentDepth: number,
  maxDepth: number,
): boolean {
  if (currentDepth > maxDepth) return false;
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (!checkNestingDepth(v, currentDepth + 1, maxDepth)) return false;
    }
  }
  return true;
}

function stripSensitiveKeys(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!STRIPPED_PROPERTY_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

@Injectable()
export class EventValidationService {
  validateAndNormalize(event: EventDto): ValidationResult {
    const eventName = event.eventName.trim();
    if (!eventName) {
      return {
        normalized: event as NormalizedEvent,
        status: 'REJECTED',
        error: 'eventName is empty after trimming',
      };
    }

    const timestamp = new Date(event.timestamp);
    const now = Date.now();

    if (timestamp.getTime() > now + MAX_FUTURE_MS) {
      return {
        normalized: event as NormalizedEvent,
        status: 'REJECTED',
        error: 'timestamp is too far in the future',
      };
    }

    if (timestamp.getTime() < now - MAX_AGE_MS) {
      return {
        normalized: event as NormalizedEvent,
        status: 'REJECTED',
        error: 'timestamp is too old',
      };
    }

    let properties = event.properties;
    if (properties) {
      properties = stripSensitiveKeys(properties);

      const serialized = JSON.stringify(properties);
      if (serialized.length > MAX_PROPERTIES_SIZE) {
        return {
          normalized: event as NormalizedEvent,
          status: 'REJECTED',
          error: 'properties exceed maximum size of 32KB',
        };
      }

      if (!checkNestingDepth(properties, 0, MAX_NESTING_DEPTH)) {
        return {
          normalized: event as NormalizedEvent,
          status: 'REJECTED',
          error: 'properties exceed maximum nesting depth of 5',
        };
      }
    }

    const anonymousId = event.anonymousId?.trim() || undefined;
    const userId = event.userId?.trim() || undefined;
    const sdkVersion = event.sdkVersion?.trim() || undefined;

    return {
      normalized: {
        eventId: event.eventId,
        eventName,
        timestamp: event.timestamp,
        anonymousId,
        userId,
        properties,
        sdkVersion,
      },
      status: 'VALID',
    };
  }
}
