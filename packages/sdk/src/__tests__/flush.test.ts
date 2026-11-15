import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { init, flush, destroy, _reset } from '../index.js';
import { UserpulseClient } from '../client.js';

const TEST_KEY = 'test-api-key-123';
const TEST_ENDPOINT = 'https://test.userpulse.dev/v1/events';

describe('flush()', () => {
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

  it('sends queued events as POST to the endpoint', async () => {
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('click_button');

    await client.flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(TEST_ENDPOINT);
    expect(options.method).toBe('POST');
  });

  it('clears the queue after successful flush', async () => {
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');
    client.track('event2');
    expect(client.queue.length).toBeGreaterThan(0);

    await client.flush();

    expect(client.queue.length).toBe(0);
  });

  it('includes correct headers', async () => {
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');

    await client.flush();

    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe(`Bearer ${TEST_KEY}`);
  });

  it('sends batch in { batch: [...] } format', async () => {
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');
    client.track('event2');

    await client.flush();

    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { batch: unknown[] };
    expect(body.batch).toBeInstanceOf(Array);
    expect(body.batch).toHaveLength(2);
    expect((body.batch[0] as { eventName: string }).eventName).toBe('event1');
    expect((body.batch[1] as { eventName: string }).eventName).toBe('event2');
  });

  it('does nothing when queue is empty', async () => {
    init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT });

    await flush();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps events in queue on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');

    await client.flush();

    expect(client.queue.length).toBe(1);
    expect(client.queue[0].eventName).toBe('event1');
  });

  it('keeps events in queue on non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');

    await client.flush();

    expect(client.queue.length).toBe(1);
    expect(client.queue[0].eventName).toBe('event1');
  });

  it('never throws to the caller', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('catastrophic'));
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');

    await expect(client.flush()).resolves.toBeUndefined();
  });

  it('sets keepalive: true on fetch', async () => {
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');

    await client.flush();

    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(options.keepalive).toBe(true);
  });

  it('does not double-flush when called concurrently', async () => {
    let resolveFirst!: () => void;
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: boolean; status: number }>((resolve) => {
          resolveFirst = () => resolve({ ok: true, status: 200 });
        }),
    );

    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');

    const first = client.flush();
    const second = client.flush();

    resolveFirst();
    await first;
    await second;

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('requeues events respecting maxQueueSize on failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'));
    const client = init({
      apiKey: TEST_KEY,
      endpoint: TEST_ENDPOINT,
      maxQueueSize: 5,
    }) as UserpulseClient;

    client.track('event1');
    client.track('event2');

    // Wait for any pending threshold flush to settle
    await vi.advanceTimersByTimeAsync(0);

    // Explicit flush — events should be requeued on failure
    await client.flush();

    expect(client.queue.length).toBe(2);
    expect(client.queue[0].eventName).toBe('event1');
    expect(client.queue[1].eventName).toBe('event2');

    // Fill up to maxQueueSize
    client.track('event3');
    client.track('event4');
    client.track('event5');

    // Wait for threshold flush to settle
    await vi.advanceTimersByTimeAsync(0);

    // Queue should not exceed maxQueueSize
    expect(client.queue.length).toBeLessThanOrEqual(5);
  });
});

describe('auto-flush', () => {
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

  it('flushes on the configured interval', async () => {
    const client = init({
      apiKey: TEST_KEY,
      endpoint: TEST_ENDPOINT,
      flushInterval: 5000,
    }) as UserpulseClient;
    client.track('event1');

    expect(fetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not flush before the interval', async () => {
    const client = init({
      apiKey: TEST_KEY,
      endpoint: TEST_ENDPOINT,
      flushInterval: 5000,
    }) as UserpulseClient;
    client.track('event1');

    await vi.advanceTimersByTimeAsync(4999);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('flushes repeatedly on each interval', async () => {
    const client = init({
      apiKey: TEST_KEY,
      endpoint: TEST_ENDPOINT,
      flushInterval: 1000,
    }) as UserpulseClient;

    client.track('event1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(1);

    client.track('event2');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('destroy()', () => {
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

  it('stops the auto-flush timer', async () => {
    const client = init({
      apiKey: TEST_KEY,
      endpoint: TEST_ENDPOINT,
      flushInterval: 1000,
    }) as UserpulseClient;

    client.destroy();
    client.track('event1');

    await vi.advanceTimersByTimeAsync(5000);

    // Only 1 call from destroy's flush, not from the timer
    expect(fetch).toHaveBeenCalledTimes(0);
  });

  it('triggers a final flush', async () => {
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');

    client.destroy();
    // flush is fire-and-forget from destroy, advance timers to resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('top-level flush() and destroy()', () => {
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

  it('top-level flush() sends events', async () => {
    const client = init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT }) as UserpulseClient;
    client.track('event1');

    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.queue.length).toBe(0);
  });

  it('top-level flush() warns if not initialized', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await flush();

    expect(warn).toHaveBeenCalledWith('UserpulseSDK: Not initialized. Call init() before flush().');
    warn.mockRestore();
  });

  it('top-level destroy() cleans up', () => {
    init({ apiKey: TEST_KEY, endpoint: TEST_ENDPOINT });

    expect(() => destroy()).not.toThrow();
  });

  it('top-level destroy() is safe when not initialized', () => {
    expect(() => destroy()).not.toThrow();
  });
});

describe('flush-at-threshold', () => {
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

  it('auto-flushes when queue reaches half of maxQueueSize', () => {
    const client = init({
      apiKey: TEST_KEY,
      endpoint: TEST_ENDPOINT,
      maxQueueSize: 10,
    }) as UserpulseClient;

    // Add events up to threshold (5 = 10/2)
    for (let i = 0; i < 4; i++) {
      client.track(`event${i}`);
    }
    expect(fetch).not.toHaveBeenCalled();

    // 5th event triggers threshold flush
    client.track('event4');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
