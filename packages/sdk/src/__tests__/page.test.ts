import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { init, page, _reset } from '../index.js';
import { UserpulseClient } from '../client.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

function getQueue(client: ReturnType<typeof init>): unknown[] {
  return (client as unknown as UserpulseClient).queue;
}

describe('page()', () => {
  beforeEach(() => {
    _reset();
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    _reset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('queues a $page event with name', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Home');

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: '$page',
      properties: { name: 'Home' },
    });
  });

  it('queues a $page event with name and properties', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Product', { path: '/products/123', category: 'electronics' });

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: '$page',
      properties: { name: 'Product', path: '/products/123', category: 'electronics' },
    });
  });

  it('queues a $page event without name', () => {
    const client = init({ apiKey: 'test-key' });
    client.page();

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    const event = queue[0] as Record<string, unknown>;
    expect(event.eventName).toBe('$page');
    expect(event).not.toHaveProperty('properties');
  });

  it('queues a $page event with only properties (no name)', () => {
    const client = init({ apiKey: 'test-key' });
    client.page(undefined, { path: '/dashboard', referrer: '/login' });

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: '$page',
      properties: { path: '/dashboard', referrer: '/login' },
    });
  });

  it('creates events with correct structure', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Settings');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;

    expect(event.eventId).toMatch(UUID_REGEX);
    expect(event.eventName).toBe('$page');
    expect(event.timestamp).toMatch(ISO_REGEX);
    expect(event.anonymousId).toBe(client.anonymousId);
    expect(event.sdkVersion).toBe(client.sdkVersion);
  });

  it('includes userId after identify()', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-456');
    client.page('Dashboard');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event.userId).toBe('user-456');
  });

  it('does not include userId before identify()', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Landing');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event).not.toHaveProperty('userId');
  });

  it('drops events when queue is full', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const client = init({ apiKey: 'test-key', maxQueueSize: 3 });
    // First event triggers threshold flush, drains queue, flushing stays true
    client.page('Page1');
    client.page('Page2');
    client.page('Page3');
    client.page('Page4');
    // queue=[Page2, Page3, Page4] at capacity
    client.page('Page5_dropped');

    const queue = getQueue(client);
    expect(queue).toHaveLength(3);
  });

  it('logs debug warning when queue is full and debug is true', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', maxQueueSize: 2, debug: true });
    // Threshold flush drains after first event
    client.page('First');
    client.page('Second');
    client.page('Third');
    // queue=[Second, Third] at capacity
    client.page('Dropped');

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Event queue is full. Event dropped.');
    warnSpy.mockRestore();
  });

  it('does not auto-collect browser globals', () => {
    const client = init({ apiKey: 'test-key' });
    client.page();

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event).not.toHaveProperty('url');
    expect(event).not.toHaveProperty('referrer');
    expect(event).not.toHaveProperty('title');
    expect(event).not.toHaveProperty('search');
  });

  it('caller-provided properties override name when both use "name" key', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('FromParam', { name: 'FromProps' });

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    const props = event.properties as Record<string, unknown>;
    expect(props.name).toBe('FromProps');
  });
});

describe('top-level page()', () => {
  beforeEach(() => {
    _reset();
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    _reset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not throw when called before init()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => page('test')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before page().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to the client after init()', () => {
    const client = init({ apiKey: 'test-key' });
    page('Overview', { section: 'main' });

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: '$page',
      properties: { name: 'Overview', section: 'main' },
    });
  });
});
