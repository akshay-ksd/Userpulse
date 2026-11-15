import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init, track, _reset } from '../index.js';
import { UserpulseClient } from '../client.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

function getQueue(client: ReturnType<typeof init>): unknown[] {
  return (client as unknown as UserpulseClient).queue;
}

describe('track()', () => {
  beforeEach(() => {
    _reset();
  });

  it('adds an event to the queue with valid event name', () => {
    const client = init({ apiKey: 'test-key' });
    client.track('button_clicked');

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ eventName: 'button_clicked' });
  });

  it('adds an event with properties', () => {
    const client = init({ apiKey: 'test-key' });
    client.track('purchase', { amount: 99.99, currency: 'USD' });

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: 'purchase',
      properties: { amount: 99.99, currency: 'USD' },
    });
  });

  it('creates events with correct structure', () => {
    const client = init({ apiKey: 'test-key' });
    client.track('signup');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;

    expect(event.eventId).toMatch(UUID_REGEX);
    expect(event.eventName).toBe('signup');
    expect(event.timestamp).toMatch(ISO_REGEX);
    expect(event.anonymousId).toBe(client.anonymousId);
    expect(event.sdkVersion).toBe(client.sdkVersion);
  });

  it('does not include properties key when none provided', () => {
    const client = init({ apiKey: 'test-key' });
    client.track('click');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event).not.toHaveProperty('properties');
  });

  it('ignores empty string event name without throwing', () => {
    const client = init({ apiKey: 'test-key' });
    expect(() => client.track('')).not.toThrow();

    const queue = getQueue(client);
    expect(queue).toHaveLength(0);
  });

  it('ignores non-string event name without throwing', () => {
    const client = init({ apiKey: 'test-key' });
    expect(() => client.track(123 as unknown as string)).not.toThrow();
    expect(() => client.track(null as unknown as string)).not.toThrow();
    expect(() => client.track(undefined as unknown as string)).not.toThrow();

    const queue = getQueue(client);
    expect(queue).toHaveLength(0);
  });

  it('drops events when queue is full', () => {
    const client = init({ apiKey: 'test-key', maxQueueSize: 3 });

    client.track('event_1');
    client.track('event_2');
    client.track('event_3');
    client.track('event_4_dropped');

    const queue = getQueue(client);
    expect(queue).toHaveLength(3);
    expect(queue.map((e: unknown) => (e as Record<string, unknown>).eventName)).toEqual([
      'event_1',
      'event_2',
      'event_3',
    ]);
  });

  it('queues multiple events', () => {
    const client = init({ apiKey: 'test-key' });
    client.track('first');
    client.track('second');
    client.track('third');

    const queue = getQueue(client);
    expect(queue).toHaveLength(3);
  });

  it('each event has a unique eventId', () => {
    const client = init({ apiKey: 'test-key' });
    client.track('a');
    client.track('b');

    const queue = getQueue(client);
    const ids = queue.map((e: unknown) => (e as Record<string, unknown>).eventId);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('logs debug warning for empty event name when debug is true', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', debug: true });
    client.track('');

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: track() requires a non-empty event name.');
    warnSpy.mockRestore();
  });

  it('logs debug warning when queue is full and debug is true', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', maxQueueSize: 1, debug: true });
    client.track('first');
    client.track('dropped');

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Event queue is full. Event dropped.');
    warnSpy.mockRestore();
  });
});

describe('top-level track()', () => {
  beforeEach(() => {
    _reset();
  });

  it('does not throw when called before init()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => track('test')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before track().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to the client after init()', () => {
    const client = init({ apiKey: 'test-key' });
    track('from_top_level', { source: 'module' });

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: 'from_top_level',
      properties: { source: 'module' },
    });
  });
});
