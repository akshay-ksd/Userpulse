import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init, identify, _reset } from '../index.js';
import { UserpulseClient } from '../client.js';

function getQueue(client: ReturnType<typeof init>): unknown[] {
  return (client as unknown as UserpulseClient).queue;
}

function getTraits(client: ReturnType<typeof init>): Record<string, unknown> | null {
  return (client as unknown as UserpulseClient).userTraits;
}

describe('identify()', () => {
  beforeEach(() => {
    _reset();
  });

  it('sets userId on the client', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-123');

    expect(client.userId).toBe('user-123');
  });

  it('stores traits when provided', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-123', { name: 'Jane', plan: 'pro' });

    expect(client.userId).toBe('user-123');
    expect(getTraits(client)).toEqual({ name: 'Jane', plan: 'pro' });
  });

  it('includes userId in subsequent track() events', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-456');
    client.track('button_clicked');

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: 'button_clicked',
      userId: 'user-456',
    });
  });

  it('does not include userId in track() events before identify()', () => {
    const client = init({ apiKey: 'test-key' });
    client.track('page_view');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event).not.toHaveProperty('userId');
  });

  it('ignores empty string userId without throwing', () => {
    const client = init({ apiKey: 'test-key' });
    expect(() => client.identify('')).not.toThrow();
    expect(client.userId).toBeNull();
  });

  it('ignores non-string userId without throwing', () => {
    const client = init({ apiKey: 'test-key' });
    expect(() => client.identify(123 as unknown as string)).not.toThrow();
    expect(() => client.identify(null as unknown as string)).not.toThrow();
    expect(() => client.identify(undefined as unknown as string)).not.toThrow();
    expect(client.userId).toBeNull();
  });

  it('replaces userId when called again with a different value', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-1');
    expect(client.userId).toBe('user-1');

    client.identify('user-2');
    expect(client.userId).toBe('user-2');
  });

  it('preserves anonymousId after identify()', () => {
    const client = init({ apiKey: 'test-key' });
    const anonId = client.anonymousId;
    client.identify('user-789');
    client.track('test_event');

    expect(client.anonymousId).toBe(anonId);
    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event.anonymousId).toBe(anonId);
    expect(event.userId).toBe('user-789');
  });

  it('logs debug warning for empty userId when debug is true', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', debug: true });
    client.identify('');

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: identify() requires a non-empty userId.');
    warnSpy.mockRestore();
  });
});

describe('top-level identify()', () => {
  beforeEach(() => {
    _reset();
  });

  it('does not throw when called before init()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => identify('user-123')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before identify().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to the client after init()', () => {
    const client = init({ apiKey: 'test-key' });
    identify('user-top-level', { role: 'admin' });

    expect(client.userId).toBe('user-top-level');
    expect(getTraits(client)).toEqual({ role: 'admin' });
  });
});
