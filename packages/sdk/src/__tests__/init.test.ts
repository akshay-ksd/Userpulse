import { describe, it, expect, beforeEach } from 'vitest';
import { init, getClient, _reset, SDK_VERSION } from '../index.js';

describe('SDK initialization', () => {
  beforeEach(() => {
    _reset();
  });

  it('init() with valid apiKey returns an initialized instance', () => {
    const instance = init({ apiKey: 'test-key-123' });
    expect(instance.isInitialized).toBe(true);
    expect(instance.config.apiKey).toBe('test-key-123');
  });

  it('init() with missing apiKey throws', () => {
    expect(() => init({} as any)).toThrow('UserpulseSDK: apiKey is required');
  });

  it('init() with empty string apiKey throws', () => {
    expect(() => init({ apiKey: '' })).toThrow('UserpulseSDK: apiKey is required');
  });

  it('init() with whitespace-only apiKey throws', () => {
    expect(() => init({ apiKey: '   ' })).toThrow('UserpulseSDK: apiKey is required');
  });

  it('init() with null config throws', () => {
    expect(() => init(null as any)).toThrow('UserpulseSDK: apiKey is required');
  });

  it('init() applies default config values', () => {
    const instance = init({ apiKey: 'key' });
    expect(instance.config.endpoint).toBe('https://api.userpulse.dev/v1/events');
    expect(instance.config.flushInterval).toBe(30_000);
    expect(instance.config.maxQueueSize).toBe(100);
    expect(instance.config.debug).toBe(false);
  });

  it('init() preserves custom config values', () => {
    const instance = init({
      apiKey: 'key',
      endpoint: 'https://custom.example.com/events',
      flushInterval: 5000,
      maxQueueSize: 50,
      debug: true,
    });
    expect(instance.config.endpoint).toBe('https://custom.example.com/events');
    expect(instance.config.flushInterval).toBe(5000);
    expect(instance.config.maxQueueSize).toBe(50);
    expect(instance.config.debug).toBe(true);
  });

  it('init() generates an anonymousId in UUID format', () => {
    const instance = init({ apiKey: 'key' });
    expect(instance.anonymousId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('init() sets sdkVersion to a non-empty string', () => {
    const instance = init({ apiKey: 'key' });
    expect(instance.sdkVersion).toBe(SDK_VERSION);
    expect(instance.sdkVersion.length).toBeGreaterThan(0);
  });

  it('getClient() before init() throws', () => {
    expect(() => getClient()).toThrow('UserpulseSDK: Not initialized. Call init() first.');
  });

  it('getClient() after init() returns the instance', () => {
    const instance = init({ apiKey: 'key' });
    expect(getClient()).toBe(instance);
  });

  it('calling init() twice replaces the instance', () => {
    const first = init({ apiKey: 'key-1' });
    const second = init({ apiKey: 'key-2' });
    expect(second).not.toBe(first);
    expect(getClient()).toBe(second);
    expect(getClient().config.apiKey).toBe('key-2');
  });

  it('initialization is synchronous', () => {
    const result = init({ apiKey: 'key' });
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.isInitialized).toBe(true);
  });

  it('config is frozen', () => {
    const instance = init({ apiKey: 'key' });
    expect(() => {
      (instance.config as any).apiKey = 'hacked';
    }).toThrow();
  });
});
