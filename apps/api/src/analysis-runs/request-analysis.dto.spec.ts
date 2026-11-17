import { describe, expect, it } from 'vitest';
import { requestAnalysisSchema } from './request-analysis.dto.js';

describe('requestAnalysisSchema', () => {
  it('accepts empty body with defaults', () => {
    const result = requestAnalysisSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.periodStart).toBeInstanceOf(Date);
      expect(result.data.periodEnd).toBeInstanceOf(Date);
      expect(result.data.periodEnd.getTime()).toBeGreaterThan(
        result.data.periodStart.getTime(),
      );
    }
  });

  it('accepts custom dates', () => {
    const result = requestAnalysisSchema.safeParse({
      periodStart: '2026-10-01T00:00:00Z',
      periodEnd: '2026-10-31T23:59:59Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.periodStart.toISOString()).toBe(
        '2026-10-01T00:00:00.000Z',
      );
    }
  });

  it('rejects when periodStart >= periodEnd', () => {
    const result = requestAnalysisSchema.safeParse({
      periodStart: '2026-11-15T00:00:00Z',
      periodEnd: '2026-11-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects period longer than 90 days', () => {
    const result = requestAnalysisSchema.safeParse({
      periodStart: '2026-01-01T00:00:00Z',
      periodEnd: '2026-06-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects periodEnd far in the future', () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const start = new Date(future.getTime() - 10 * 24 * 60 * 60 * 1000);
    const result = requestAnalysisSchema.safeParse({
      periodStart: start.toISOString(),
      periodEnd: future.toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
