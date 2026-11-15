import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init, reset, _reset } from '../index.js';
import { UserpulseClient } from '../client.js';

function getQueue(client: ReturnType<typeof init>): unknown[] {
  return (client as unknown as UserpulseClient).queue;
}

function getTraits(client: ReturnType<typeof init>): Record<string, unknown> | null {
  return (client as unknown as UserpulseClient).userTraits;
}

describe('reset()', () => {
  beforeEach(() => {
    _reset();
  });

  it('clears userId to null', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-123');
    expect(client.userId).toBe('user-123');

    client.reset();
    expect(client.userId).toBeNull();
  });

  it('clears userTraits to null', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-123', { name: 'Jane', plan: 'pro' });
    expect(getTraits(client)).toEqual({ name: 'Jane', plan: 'pro' });

    client.reset();
    expect(getTraits(client)).toBeNull();
  });

  it('generates a new anonymousId', () => {
    const client = init({ apiKey: 'test-key' });
    const originalAnonId = client.anonymousId;

    client.reset();
    expect(client.anonymousId).not.toBe(originalAnonId);
    expect(client.anonymousId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('subsequent track() events have no userId after reset', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-456');
    client.reset();
    client.track('after_reset');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event).not.toHaveProperty('userId');
    expect(event.eventName).toBe('after_reset');
  });

  it('subsequent track() events use the new anonymousId', () => {
    const client = init({ apiKey: 'test-key' });
    const originalAnonId = client.anonymousId;
    client.reset();
    const newAnonId = client.anonymousId;
    client.track('after_reset');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event.anonymousId).toBe(newAnonId);
    expect(event.anonymousId).not.toBe(originalAnonId);
  });

  it('preserves queued events with their original identity', () => {
    const client = init({ apiKey: 'test-key' });
    const originalAnonId = client.anonymousId;
    client.identify('user-789');
    client.track('before_reset');

    client.reset();
    client.track('after_reset');

    const queue = getQueue(client);
    expect(queue).toHaveLength(2);

    const beforeEvent = queue[0] as Record<string, unknown>;
    expect(beforeEvent.userId).toBe('user-789');
    expect(beforeEvent.anonymousId).toBe(originalAnonId);

    const afterEvent = queue[1] as Record<string, unknown>;
    expect(afterEvent).not.toHaveProperty('userId');
    expect(afterEvent.anonymousId).not.toBe(originalAnonId);
  });

  it('does not throw', () => {
    const client = init({ apiKey: 'test-key' });
    expect(() => client.reset()).not.toThrow();
  });

  it('works after identify + track + reset cycle', () => {
    const client = init({ apiKey: 'test-key' });

    client.identify('user-A');
    client.track('event-1');
    client.reset();
    client.identify('user-B');
    client.track('event-2');

    const queue = getQueue(client);
    expect(queue).toHaveLength(2);

    const event1 = queue[0] as Record<string, unknown>;
    expect(event1.userId).toBe('user-A');

    const event2 = queue[1] as Record<string, unknown>;
    expect(event2.userId).toBe('user-B');
  });

  it('subsequent page() events have no userId after reset', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-page');
    client.reset();
    client.page('Home');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event).not.toHaveProperty('userId');
    expect(event.eventName).toBe('$page');
  });
});

describe('top-level reset()', () => {
  beforeEach(() => {
    _reset();
  });

  it('warns when called before init()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => reset()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before reset().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to the client after init()', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-top-level', { role: 'admin' });
    const originalAnonId = client.anonymousId;

    reset();

    expect(client.userId).toBeNull();
    expect(getTraits(client)).toBeNull();
    expect(client.anonymousId).not.toBe(originalAnonId);
  });
});
