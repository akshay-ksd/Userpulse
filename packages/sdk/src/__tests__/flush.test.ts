import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { init, flush, destroy, _reset } from '../index.js';
import { UserpulseClient } from '../client.js';

function getQueue(client: ReturnType<typeof init>): unknown[] {
  return (client as unknown as UserpulseClient).queue;
}

describe('flush()', () => {
  beforeEach(() => {
    _reset();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    _reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends queued events via fetch and clears the queue', async () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('evt1');
    client.track('evt2');

    expect(getQueue(client)).toHaveLength(2);
    await client.flush();

    expect(getQueue(client)).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not call fetch when queue is empty', async () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    await client.flush();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends correct payload shape { batch: [...] }', async () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('test_event');
    await client.flush();

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body).toHaveProperty('batch');
    expect(Array.isArray(body.batch)).toBe(true);
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0].eventName).toBe('test_event');
  });

  it('sends correct headers', async () => {
    const client = init({ apiKey: 'my-secret-key', flushInterval: 0 });
    client.track('test_event');
    await client.flush();

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer my-secret-key',
    });
  });

  it('sends to configured endpoint', async () => {
    const client = init({
      apiKey: 'test-key',
      endpoint: 'https://custom.example.com/events',
      flushInterval: 0,
    });
    client.track('test_event');
    await client.flush();

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://custom.example.com/events');
  });

  it('catches network errors without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('test_event');

    await expect(client.flush()).resolves.toBeUndefined();
  });

  it('logs debug warning on network failure when debug is true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const client = init({ apiKey: 'test-key', debug: true, flushInterval: 0 });
    client.track('test_event');
    await client.flush();

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Failed to flush events.');
    warnSpy.mockRestore();
  });

  it('does not log on network failure when debug is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const client = init({ apiKey: 'test-key', debug: false, flushInterval: 0 });
    client.track('test_event');
    await client.flush();

    expect(warnSpy).not.toHaveBeenCalledWith('UserpulseSDK: Failed to flush events.');
    warnSpy.mockRestore();
  });

  it('clears queue even on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('test_event');
    await client.flush();

    expect(getQueue(client)).toHaveLength(0);
  });
});

describe('automatic flush', () => {
  beforeEach(() => {
    _reset();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    _reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fires after flushInterval', async () => {
    const client = init({ apiKey: 'test-key', flushInterval: 5000 });
    client.track('auto_flush_event');

    expect(fetch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    // Let the microtask from the resolved fetch promise settle
    await Promise.resolve();

    expect(fetch).toHaveBeenCalled();
  });

  it('does not fire if flushInterval is 0', async () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('no_auto_flush');

    vi.advanceTimersByTime(60_000);
    await vi.runAllTimersAsync();

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('destroy()', () => {
  beforeEach(() => {
    _reset();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    _reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('clears the timer so auto-flush stops', async () => {
    const client = init({ apiKey: 'test-key', flushInterval: 5000 });
    client.track('before_destroy');
    client.destroy();

    // Clear the flush call from destroy
    (fetch as ReturnType<typeof vi.fn>).mockClear();

    vi.advanceTimersByTime(10_000);
    await vi.runAllTimersAsync();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('triggers a flush of remaining events', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('flush_on_destroy');
    client.destroy();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('causes track() to be ignored after destroy', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.destroy();
    client.track('should_be_ignored');

    expect(getQueue(client)).toHaveLength(0);
  });

  it('causes page() to be ignored after destroy', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.destroy();
    client.page('should_be_ignored');

    expect(getQueue(client)).toHaveLength(0);
  });

  it('is idempotent', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('event');
    client.destroy();
    client.destroy();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('top-level flush()', () => {
  beforeEach(() => {
    _reset();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    _reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('warns when called before init()', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await flush();
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before flush().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to client after init()', async () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('top_level_flush');
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getQueue(client)).toHaveLength(0);
  });
});

describe('top-level destroy()', () => {
  beforeEach(() => {
    _reset();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    _reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('warns when called before init()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    destroy();
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before destroy().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to client after init()', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('destroy_test');
    destroy();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
