import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventValidationService } from './event-validation.service.js';
import type { EventDto } from './submit-events.dto.js';

function makeEvent(overrides?: Partial<EventDto>): EventDto {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    eventName: 'button_click',
    timestamp: new Date().toISOString(),
    anonymousId: 'anon-123',
    userId: 'user-456',
    properties: { page: 'home' },
    sdkVersion: '0.1.0',
    ...overrides,
  };
}

describe('EventValidationService', () => {
  let service: EventValidationService;

  beforeEach(() => {
    service = new EventValidationService();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes a valid event through with trimmed values', () => {
    const result = service.validateAndNormalize(
      makeEvent({ eventName: '  button_click  ', anonymousId: '  anon  ' }),
    );
    expect(result.status).toBe('VALID');
    expect(result.normalized.eventName).toBe('button_click');
    expect(result.normalized.anonymousId).toBe('anon');
    expect(result.error).toBeUndefined();
  });

  it('rejects eventName that is empty after trimming', () => {
    const result = service.validateAndNormalize(
      makeEvent({ eventName: '   ' }),
    );
    expect(result.status).toBe('REJECTED');
    expect(result.error).toContain('eventName is empty');
  });

  it('rejects timestamp too far in the future (> 1 hour)', () => {
    const future = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const result = service.validateAndNormalize(
      makeEvent({ timestamp: future }),
    );
    expect(result.status).toBe('REJECTED');
    expect(result.error).toContain('future');
  });

  it('accepts timestamp within 1 hour in the future', () => {
    const nearFuture = new Date(Date.now() + 30 * 60_000).toISOString();
    const result = service.validateAndNormalize(
      makeEvent({ timestamp: nearFuture }),
    );
    expect(result.status).toBe('VALID');
  });

  it('rejects timestamp older than 1 year', () => {
    const old = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString();
    const result = service.validateAndNormalize(makeEvent({ timestamp: old }));
    expect(result.status).toBe('REJECTED');
    expect(result.error).toContain('too old');
  });

  it('rejects oversized properties', () => {
    const bigValue = 'x'.repeat(40_000);
    const result = service.validateAndNormalize(
      makeEvent({ properties: { data: bigValue } }),
    );
    expect(result.status).toBe('REJECTED');
    expect(result.error).toContain('maximum size');
  });

  it('rejects deeply nested properties', () => {
    let nested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 7; i++) {
      nested = { child: nested };
    }
    const result = service.validateAndNormalize(
      makeEvent({ properties: nested }),
    );
    expect(result.status).toBe('REJECTED');
    expect(result.error).toContain('nesting depth');
  });

  it('strips organizationId, projectId, and apiKey from properties', () => {
    const result = service.validateAndNormalize(
      makeEvent({
        properties: {
          organizationId: 'org-hack',
          projectId: 'proj-hack',
          apiKey: 'secret',
          apikey: 'secret2',
          api_key: 'secret3',
          safe: 'keep',
        },
      }),
    );
    expect(result.status).toBe('VALID');
    expect(result.normalized.properties).toEqual({ safe: 'keep' });
  });

  it('normalizes empty anonymousId to undefined', () => {
    const result = service.validateAndNormalize(
      makeEvent({ anonymousId: '   ' }),
    );
    expect(result.status).toBe('VALID');
    expect(result.normalized.anonymousId).toBeUndefined();
  });

  it('normalizes empty userId to undefined', () => {
    const result = service.validateAndNormalize(makeEvent({ userId: '   ' }));
    expect(result.status).toBe('VALID');
    expect(result.normalized.userId).toBeUndefined();
  });

  it('passes a valid event with no optional fields', () => {
    const result = service.validateAndNormalize(
      makeEvent({
        anonymousId: undefined,
        userId: undefined,
        properties: undefined,
        sdkVersion: undefined,
      }),
    );
    expect(result.status).toBe('VALID');
    expect(result.normalized.anonymousId).toBeUndefined();
    expect(result.normalized.userId).toBeUndefined();
    expect(result.normalized.properties).toBeUndefined();
    expect(result.normalized.sdkVersion).toBeUndefined();
  });

  it('trims sdkVersion', () => {
    const result = service.validateAndNormalize(
      makeEvent({ sdkVersion: '  0.1.0  ' }),
    );
    expect(result.status).toBe('VALID');
    expect(result.normalized.sdkVersion).toBe('0.1.0');
  });
});
