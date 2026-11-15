import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init, identify, reset, _reset } from '../index.js';
import { UserpulseClient } from '../client.js';

function getQueue(client: ReturnType<typeof init>): unknown[] {
  return (client as unknown as UserpulseClient).queue;
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

  it('stores traits on the client', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-123', { plan: 'pro', name: 'Alice' });

    expect((client as unknown as UserpulseClient).traits).toEqual({
      plan: 'pro',
      name: 'Alice',
    });
  });

  it('includes userId in subsequent track events', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-123');
    client.track('button_clicked');

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: 'button_clicked',
      userId: 'user-123',
    });
  });

  it('does not include userId in events before identify', () => {
    const client = init({ apiKey: 'test-key' });
    client.track('before_identify');

    const queue = getQueue(client);
    expect(queue[0]).not.toHaveProperty('userId');
  });

  it('ignores empty string userId without throwing', () => {
    const client = init({ apiKey: 'test-key' });
    expect(() => client.identify('')).not.toThrow();

    expect(client.userId).toBeUndefined();
  });

  it('ignores non-string userId without throwing', () => {
    const client = init({ apiKey: 'test-key' });
    expect(() => client.identify(123 as unknown as string)).not.toThrow();
    expect(() => client.identify(null as unknown as string)).not.toThrow();
    expect(() => client.identify(undefined as unknown as string)).not.toThrow();

    expect(client.userId).toBeUndefined();
  });

  it('last identify call wins', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-1');
    client.identify('user-2');

    expect(client.userId).toBe('user-2');

    client.track('test');
    const queue = getQueue(client);
    expect(queue[0]).toMatchObject({ userId: 'user-2' });
  });

  it('logs debug warning for empty userId when debug is true', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', debug: true });
    client.identify('');

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: identify() requires a non-empty user ID.');
    warnSpy.mockRestore();
  });
});

describe('reset()', () => {
  beforeEach(() => {
    _reset();
  });

  it('clears userId', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-123');
    client.reset();

    expect(client.userId).toBeUndefined();
  });

  it('generates a new anonymousId', () => {
    const client = init({ apiKey: 'test-key' });
    const originalAnonymousId = client.anonymousId;
    client.reset();

    expect(client.anonymousId).not.toBe(originalAnonymousId);
  });

  it('events after reset do not include userId', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-123');
    client.reset();
    client.track('after_reset');

    const queue = getQueue(client);
    expect(queue[0]).not.toHaveProperty('userId');
  });

  it('events after reset use the new anonymousId', () => {
    const client = init({ apiKey: 'test-key' });
    const originalAnonymousId = client.anonymousId;
    client.reset();
    client.track('after_reset');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event.anonymousId).not.toBe(originalAnonymousId);
    expect(event.anonymousId).toBe(client.anonymousId);
  });
});

describe('top-level identify()', () => {
  beforeEach(() => {
    _reset();
  });

  it('does not throw when called before init()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => identify('user-1')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before identify().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to the client after init()', () => {
    const client = init({ apiKey: 'test-key' });
    identify('user-456', { role: 'admin' });

    expect(client.userId).toBe('user-456');
  });
});

describe('top-level reset()', () => {
  beforeEach(() => {
    _reset();
  });

  it('does not throw when called before init()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => reset()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before reset().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to the client after init()', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-123');
    reset();

    expect(client.userId).toBeUndefined();
  });
});
