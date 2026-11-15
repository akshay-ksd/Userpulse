import { describe, it, expect } from 'vitest';
import { submitBatchSchema } from './ingestion.dto.js';

describe('submitBatchSchema', () => {
  const validEvent = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    eventName: 'button_click',
    timestamp: '2026-11-15T10:00:00.000Z',
    anonymousId: 'anon-123',
    sdkVersion: '0.1.0',
  };

  it('accepts a valid batch', () => {
    const result = submitBatchSchema.safeParse({ batch: [validEvent] });
    expect(result.success).toBe(true);
  });

  it('accepts a batch with optional fields', () => {
    const result = submitBatchSchema.safeParse({
      batch: [
        {
          ...validEvent,
          userId: 'user-1',
          sessionId: 'sess-1',
          properties: { key: 'value' },
          pageName: 'Home',
          pagePath: '/home',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty batch', () => {
    const result = submitBatchSchema.safeParse({ batch: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a batch over 100 events', () => {
    const events = Array.from({ length: 101 }, (_, i) => ({
      ...validEvent,
      eventId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
    }));
    const result = submitBatchSchema.safeParse({ batch: events });
    expect(result.success).toBe(false);
  });

  it('rejects an event missing eventId', () => {
    const { eventId: _, ...noId } = validEvent;
    const result = submitBatchSchema.safeParse({ batch: [noId] });
    expect(result.success).toBe(false);
  });

  it('rejects an event with invalid eventId format', () => {
    const result = submitBatchSchema.safeParse({
      batch: [{ ...validEvent, eventId: 'not-a-uuid' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an event missing eventName', () => {
    const { eventName: _, ...noName } = validEvent;
    const result = submitBatchSchema.safeParse({ batch: [noName] });
    expect(result.success).toBe(false);
  });

  it('rejects an event with empty eventName', () => {
    const result = submitBatchSchema.safeParse({
      batch: [{ ...validEvent, eventName: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an event missing timestamp', () => {
    const { timestamp: _, ...noTs } = validEvent;
    const result = submitBatchSchema.safeParse({ batch: [noTs] });
    expect(result.success).toBe(false);
  });

  it('rejects an event with invalid timestamp', () => {
    const result = submitBatchSchema.safeParse({
      batch: [{ ...validEvent, timestamp: 'not-a-date' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 100 events', () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      ...validEvent,
      eventId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
    }));
    const result = submitBatchSchema.safeParse({ batch: events });
    expect(result.success).toBe(true);
  });
});
