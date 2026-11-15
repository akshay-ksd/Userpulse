import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  });

  it('adds a $page event to the queue with a name', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Home');

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ eventName: '$page', pageName: 'Home' });
  });

  it('adds a $page event with name and properties', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Settings', { section: 'billing' });

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: '$page',
      pageName: 'Settings',
      properties: { section: 'billing' },
    });
  });

  it('extracts path from properties into pagePath', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Settings', { path: '/settings', section: 'billing' });

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event.pagePath).toBe('/settings');
    expect(event.pageName).toBe('Settings');
    expect(event.properties).toEqual({ section: 'billing' });
  });

  it('sets pagePath without leftover path in properties', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Home', { path: '/home' });

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event.pagePath).toBe('/home');
    expect(event).not.toHaveProperty('properties');
  });

  it('adds a $page event without arguments', () => {
    const client = init({ apiKey: 'test-key' });
    client.page();

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    const event = queue[0] as Record<string, unknown>;
    expect(event.eventName).toBe('$page');
    expect(event).not.toHaveProperty('pageName');
    expect(event).not.toHaveProperty('pagePath');
    expect(event).not.toHaveProperty('properties');
  });

  it('follows the standard event contract', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Dashboard');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;

    expect(event.eventId).toMatch(UUID_REGEX);
    expect(event.eventName).toBe('$page');
    expect(event.timestamp).toMatch(ISO_REGEX);
    expect(event.anonymousId).toBe(client.anonymousId);
    expect(event.sdkVersion).toBe(client.sdkVersion);
  });

  it('includes userId when set via identify()', () => {
    const client = init({ apiKey: 'test-key' });
    client.identify('user-42');
    client.page('Profile');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event.userId).toBe('user-42');
  });

  it('does not include userId before identify()', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('Landing');

    const queue = getQueue(client);
    const event = queue[0] as Record<string, unknown>;
    expect(event).not.toHaveProperty('userId');
  });

  it('drops events when queue is full', () => {
    const client = init({ apiKey: 'test-key', maxQueueSize: 2 });
    client.page('Page1');
    client.page('Page2');
    client.page('Page3_dropped');

    const queue = getQueue(client);
    expect(queue).toHaveLength(2);
  });

  it('logs debug warning when queue full and debug is true', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', maxQueueSize: 1, debug: true });
    client.page('First');
    client.page('Dropped');

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Event queue is full. Event dropped.');
    warnSpy.mockRestore();
  });

  it('ignores empty string name but still creates event', () => {
    const client = init({ apiKey: 'test-key' });
    client.page('');

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    const event = queue[0] as Record<string, unknown>;
    expect(event.eventName).toBe('$page');
    expect(event).not.toHaveProperty('pageName');
  });
});

describe('top-level page()', () => {
  beforeEach(() => {
    _reset();
  });

  it('does not throw when called before init()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => page('Home')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before page().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to the client after init()', () => {
    const client = init({ apiKey: 'test-key' });
    page('Dashboard', { path: '/dashboard' });

    const queue = getQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      eventName: '$page',
      pageName: 'Dashboard',
      pagePath: '/dashboard',
    });
  });
});
