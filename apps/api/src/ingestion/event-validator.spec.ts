import { describe, it, expect } from 'vitest';
import { validateAndNormalize } from './event-validator.js';
import type { EventDto } from './ingestion.dto.js';

const NOW = new Date('2026-11-15T12:00:00.000Z');

function event(overrides: Partial<EventDto> = {}): EventDto {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    eventName: 'button_click',
    timestamp: '2026-11-15T11:59:00.000Z',
    anonymousId: 'anon-1',
    ...overrides,
  };
}

function run(events: EventDto[]) {
  return validateAndNormalize(events, 'org-1', 'proj-1', NOW);
}

function errorsFor(overrides: Partial<EventDto>) {
  return run([event(overrides)]).invalid[0]?.errors;
}

describe('validateAndNormalize', () => {
  it('normalizes a valid event with server-side context', () => {
    const { valid, invalid } = run([
      event({ userId: 'user-1', properties: { plan: 'pro' } }),
    ]);

    expect(invalid).toEqual([]);
    expect(valid).toEqual([
      {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        eventName: 'button_click',
        timestamp: '2026-11-15T11:59:00.000Z',
        anonymousId: 'anon-1',
        userId: 'user-1',
        properties: { plan: 'pro' },
        organizationId: 'org-1',
        projectId: 'proj-1',
        ingestedAt: '2026-11-15T12:00:00.000Z',
      },
    ]);
  });

  it('never lets payload values override tenant identifiers', () => {
    const spoofed = {
      ...event(),
      organizationId: 'other-org',
      projectId: 'other-proj',
      ingestedAt: '1999-01-01T00:00:00.000Z',
    } as EventDto;

    const { valid } = run([spoofed]);

    expect(valid[0]).toMatchObject({
      organizationId: 'org-1',
      projectId: 'proj-1',
      ingestedAt: '2026-11-15T12:00:00.000Z',
    });
  });

  it('keeps tenant-like keys inside properties as plain customer data', () => {
    const { valid } = run([
      event({ properties: { organizationId: 'other-org' } }),
    ]);

    expect(valid[0]!.organizationId).toBe('org-1');
    expect(valid[0]!.properties).toEqual({ organizationId: 'other-org' });
  });

  it('trims string fields and drops blank optional fields', () => {
    const { valid } = run([
      event({
        eventName: '  signup  ',
        anonymousId: ' anon-1 ',
        userId: '   ',
        sessionId: ' sess-1 ',
        pageName: ' Home ',
        pagePath: ' /home ',
        sdkVersion: ' 0.1.0 ',
      }),
    ]);

    expect(valid[0]).toMatchObject({
      eventName: 'signup',
      anonymousId: 'anon-1',
      sessionId: 'sess-1',
      pageName: 'Home',
      pagePath: '/home',
      sdkVersion: '0.1.0',
    });
    expect(valid[0]).not.toHaveProperty('userId');
  });

  it('normalizes timestamps with an offset to UTC', () => {
    const { valid } = run([event({ timestamp: '2026-11-15T17:00:00+05:30' })]);
    expect(valid[0]!.timestamp).toBe('2026-11-15T11:30:00.000Z');
  });

  it('rejects an event name that is blank after trimming', () => {
    expect(errorsFor({ eventName: '   ' })).toEqual(['event_name_empty']);
  });

  it('rejects an event name containing control characters', () => {
    expect(errorsFor({ eventName: 'click\u0000me' })).toEqual([
      'event_name_invalid_characters',
    ]);
  });

  it('rejects an unparseable timestamp', () => {
    expect(errorsFor({ timestamp: 'not-a-date' })).toEqual([
      'timestamp_invalid',
    ]);
  });

  it('rejects a timestamp more than 24 hours in the future', () => {
    expect(errorsFor({ timestamp: '2026-11-16T12:00:01.000Z' })).toEqual([
      'timestamp_in_future',
    ]);
  });

  it('accepts a timestamp exactly 24 hours in the future', () => {
    expect(
      run([event({ timestamp: '2026-11-16T12:00:00.000Z' })]).valid,
    ).toHaveLength(1);
  });

  it('accepts an old timestamp', () => {
    expect(
      run([event({ timestamp: '2026-09-01T00:00:00.000Z' })]).valid,
    ).toHaveLength(1);
  });

  it('rejects an event with no identity', () => {
    expect(errorsFor({ anonymousId: undefined })).toEqual(['identity_missing']);
    expect(errorsFor({ anonymousId: '  ', userId: '' })).toEqual([
      'identity_missing',
    ]);
  });

  it('accepts an event with only a userId', () => {
    const { valid } = run([
      event({ anonymousId: undefined, userId: 'user-1' }),
    ]);
    expect(valid[0]!.userId).toBe('user-1');
    expect(valid[0]).not.toHaveProperty('anonymousId');
  });

  it('enforces the property key limit', () => {
    const keys = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));

    expect(run([event({ properties: keys(50) })]).valid).toHaveLength(1);
    expect(errorsFor({ properties: keys(51) })).toEqual([
      'properties_too_many_keys',
    ]);
  });

  it('rejects properties larger than 8 KB serialized', () => {
    expect(errorsFor({ properties: { blob: 'x'.repeat(8192) } })).toEqual([
      'properties_too_large',
    ]);
  });

  it('reports every error for an event without exposing its content', () => {
    const { invalid } = run([
      event({
        eventName: ' ',
        anonymousId: undefined,
        properties: { secret: 'value' },
      }),
    ]);

    expect(invalid).toEqual([
      {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        errors: ['event_name_empty', 'identity_missing'],
      },
    ]);
  });

  it('splits a mixed batch, preserving order', () => {
    const { valid, invalid } = run([
      event({ eventId: 'a' }),
      event({ eventId: 'b', eventName: ' ' }),
      event({ eventId: 'c' }),
    ]);

    expect(valid.map((e) => e.eventId)).toEqual(['a', 'c']);
    expect(invalid.map((e) => e.eventId)).toEqual(['b']);
  });
});
