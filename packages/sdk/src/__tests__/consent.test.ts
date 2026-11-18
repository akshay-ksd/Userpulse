import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { init, track, setTrackingEnabled, _reset } from '../index.js';
import { UserpulseClient } from '../client.js';

const fetchMock = vi
  .fn<typeof fetch>()
  .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
  fetchMock.mockClear();
});

afterEach(() => {
  _reset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('consent — trackingEnabled config', () => {
  it('defaults to true — events are tracked normally', () => {
    const client = new UserpulseClient({ apiKey: 'test-key', flushInterval: 0 });
    expect(client.trackingEnabled).toBe(true);
    client.track('click');
    expect(client.queue.length).toBe(1);
    client.destroy();
  });

  it('init with trackingEnabled: false — track() does not queue', () => {
    const client = new UserpulseClient({
      apiKey: 'test-key',
      trackingEnabled: false,
      flushInterval: 0,
    });
    expect(client.trackingEnabled).toBe(false);
    client.track('click');
    expect(client.queue.length).toBe(0);
    client.destroy();
  });

  it('init with trackingEnabled: false — page() does not queue', () => {
    const client = new UserpulseClient({
      apiKey: 'test-key',
      trackingEnabled: false,
      flushInterval: 0,
    });
    client.page('Home');
    expect(client.queue.length).toBe(0);
    client.destroy();
  });

  it('init with trackingEnabled: false — flush() does not send', async () => {
    const client = new UserpulseClient({
      apiKey: 'test-key',
      trackingEnabled: true,
      flushInterval: 0,
    });
    client.track('click');
    expect(client.queue.length).toBe(1);
    client.setTrackingEnabled(false);
    await client.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    client.destroy();
  });

  it('init with trackingEnabled: false — identify() still works', () => {
    const client = new UserpulseClient({
      apiKey: 'test-key',
      trackingEnabled: false,
      flushInterval: 0,
    });
    client.identify('user-1', { plan: 'pro' });
    expect(client.userId).toBe('user-1');
    client.destroy();
  });

  it('init with trackingEnabled: false — reset() still works', () => {
    const client = new UserpulseClient({
      apiKey: 'test-key',
      trackingEnabled: false,
      flushInterval: 0,
    });
    client.identify('user-1');
    client.reset();
    expect(client.userId).toBeUndefined();
    client.destroy();
  });
});

describe('consent — setTrackingEnabled runtime', () => {
  it('setTrackingEnabled(false) stops subsequent track() calls', () => {
    const client = new UserpulseClient({ apiKey: 'test-key', flushInterval: 0 });
    client.track('before');
    expect(client.queue.length).toBe(1);

    client.setTrackingEnabled(false);
    client.track('after');
    expect(client.queue.length).toBe(1);
    client.destroy();
  });

  it('setTrackingEnabled(true) after disable resumes tracking', () => {
    const client = new UserpulseClient({ apiKey: 'test-key', flushInterval: 0 });
    client.setTrackingEnabled(false);
    client.track('ignored');
    expect(client.queue.length).toBe(0);

    client.setTrackingEnabled(true);
    client.track('resumed');
    expect(client.queue.length).toBe(1);
    expect(client.queue[0].eventName).toBe('resumed');
    client.destroy();
  });

  it('events queued before disabling remain in queue', () => {
    const client = new UserpulseClient({ apiKey: 'test-key', flushInterval: 0 });
    client.track('before');
    expect(client.queue.length).toBe(1);
    client.setTrackingEnabled(false);
    expect(client.queue.length).toBe(1);
    client.destroy();
  });
});

describe('consent — top-level exports', () => {
  it('top-level setTrackingEnabled() works', () => {
    const instance = init({ apiKey: 'test-key', flushInterval: 0 });
    track('before');
    expect((instance as UserpulseClient).queue.length).toBe(1);

    setTrackingEnabled(false);
    track('after');
    expect((instance as UserpulseClient).queue.length).toBe(1);
  });

  it('top-level setTrackingEnabled() warns if not initialized', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setTrackingEnabled(false);
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before setTrackingEnabled().',
    );
    warnSpy.mockRestore();
  });
});

describe('consent — debug warnings', () => {
  it('logs warning when track() is called with tracking disabled and debug on', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new UserpulseClient({
      apiKey: 'test-key',
      trackingEnabled: false,
      debug: true,
      flushInterval: 0,
    });
    client.track('click');
    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Tracking is disabled. Event not queued.');
    warnSpy.mockRestore();
    client.destroy();
  });

  it('logs warning when page() is called with tracking disabled and debug on', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new UserpulseClient({
      apiKey: 'test-key',
      trackingEnabled: false,
      debug: true,
      flushInterval: 0,
    });
    client.page('Home');
    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Tracking is disabled. Event not queued.');
    warnSpy.mockRestore();
    client.destroy();
  });

  it('logs warning when flush() is called with tracking disabled and debug on', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new UserpulseClient({
      apiKey: 'test-key',
      debug: true,
      flushInterval: 0,
    });
    client.track('ev');
    client.setTrackingEnabled(false);
    await client.flush();
    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Tracking is disabled. Flush skipped.');
    warnSpy.mockRestore();
    client.destroy();
  });

  it('does not log warning when debug is false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new UserpulseClient({
      apiKey: 'test-key',
      trackingEnabled: false,
      debug: false,
      flushInterval: 0,
    });
    client.track('click');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    client.destroy();
  });
});
