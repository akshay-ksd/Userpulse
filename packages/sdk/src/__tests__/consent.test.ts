import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { init, setEnabled, _reset } from '../index.js';
import { UserpulseClient } from '../client.js';

function getQueue(client: ReturnType<typeof init>): unknown[] {
  return (client as unknown as UserpulseClient).queue;
}

describe('consent — init({ enabled: false })', () => {
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

  it('track() silently no-ops when disabled', () => {
    const client = init({ apiKey: 'test-key', enabled: false, flushInterval: 0 });
    client.track('button_clicked');

    expect(getQueue(client)).toHaveLength(0);
  });

  it('page() silently no-ops when disabled', () => {
    const client = init({ apiKey: 'test-key', enabled: false, flushInterval: 0 });
    client.page('Home');

    expect(getQueue(client)).toHaveLength(0);
  });

  it('identify() silently no-ops when disabled', () => {
    const client = init({ apiKey: 'test-key', enabled: false, flushInterval: 0 });
    client.identify('user-123');

    expect(client.userId).toBeNull();
  });

  it('flush() does not send when disabled', async () => {
    const client = init({ apiKey: 'test-key', enabled: true, flushInterval: 0 });
    client.track('event_before_disable');
    client.setEnabled(false);
    await client.flush();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('enabled getter reflects disabled state', () => {
    const client = init({ apiKey: 'test-key', enabled: false, flushInterval: 0 });
    expect(client.enabled).toBe(false);
  });
});

describe('consent — defaults', () => {
  beforeEach(() => {
    _reset();
  });

  afterEach(() => {
    _reset();
  });

  it('defaults to enabled when not specified', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    expect(client.enabled).toBe(true);
  });

  it('track() works normally when enabled by default', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('event');

    expect(getQueue(client)).toHaveLength(1);
  });
});

describe('consent — setEnabled() runtime toggle', () => {
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

  it('disabling after init stops subsequent tracking', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    client.track('before');
    expect(getQueue(client)).toHaveLength(1);

    client.setEnabled(false);
    client.track('after_disable');
    expect(getQueue(client)).toHaveLength(1);
  });

  it('re-enabling resumes tracking', () => {
    const client = init({ apiKey: 'test-key', enabled: false, flushInterval: 0 });
    client.track('while_disabled');
    expect(getQueue(client)).toHaveLength(0);

    client.setEnabled(true);
    client.track('after_enable');
    expect(getQueue(client)).toHaveLength(1);
  });

  it('events while disabled are not retroactively captured', () => {
    const client = init({ apiKey: 'test-key', enabled: false, flushInterval: 0 });
    client.track('missed_event_1');
    client.track('missed_event_2');
    client.setEnabled(true);

    expect(getQueue(client)).toHaveLength(0);

    client.track('new_event');
    expect(getQueue(client)).toHaveLength(1);
    expect((getQueue(client)[0] as Record<string, unknown>).eventName).toBe('new_event');
  });

  it('enabled getter reflects changes', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    expect(client.enabled).toBe(true);

    client.setEnabled(false);
    expect(client.enabled).toBe(false);

    client.setEnabled(true);
    expect(client.enabled).toBe(true);
  });
});

describe('consent — reset() and destroy() while disabled', () => {
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

  it('reset() works while disabled', () => {
    const client = init({ apiKey: 'test-key', enabled: false, flushInterval: 0 });
    const originalAnonId = client.anonymousId;
    client.reset();

    expect(client.anonymousId).not.toBe(originalAnonId);
    expect(client.userId).toBeNull();
  });

  it('destroy() works while disabled', () => {
    const client = init({ apiKey: 'test-key', enabled: false, flushInterval: 0 });
    expect(() => client.destroy()).not.toThrow();
  });
});

describe('consent — debug warnings', () => {
  beforeEach(() => {
    _reset();
  });

  afterEach(() => {
    _reset();
  });

  it('logs warning for track() when disabled and debug=true', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', enabled: false, debug: true, flushInterval: 0 });
    client.track('test');

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Tracking is disabled. track() ignored.');
    warnSpy.mockRestore();
  });

  it('logs warning for page() when disabled and debug=true', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', enabled: false, debug: true, flushInterval: 0 });
    client.page('Home');

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Tracking is disabled. page() ignored.');
    warnSpy.mockRestore();
  });

  it('logs warning for identify() when disabled and debug=true', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', enabled: false, debug: true, flushInterval: 0 });
    client.identify('user-123');

    expect(warnSpy).toHaveBeenCalledWith('UserpulseSDK: Tracking is disabled. identify() ignored.');
    warnSpy.mockRestore();
  });

  it('does not log when disabled and debug=false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({ apiKey: 'test-key', enabled: false, debug: false, flushInterval: 0 });
    client.track('test');
    client.page('Home');
    client.identify('user-123');

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('top-level setEnabled()', () => {
  beforeEach(() => {
    _reset();
  });

  afterEach(() => {
    _reset();
  });

  it('warns when called before init()', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setEnabled(false);
    expect(warnSpy).toHaveBeenCalledWith(
      'UserpulseSDK: Not initialized. Call init() before setEnabled().',
    );
    warnSpy.mockRestore();
  });

  it('delegates to client after init()', () => {
    const client = init({ apiKey: 'test-key', flushInterval: 0 });
    expect(client.enabled).toBe(true);

    setEnabled(false);
    expect(client.enabled).toBe(false);

    setEnabled(true);
    expect(client.enabled).toBe(true);
  });
});
