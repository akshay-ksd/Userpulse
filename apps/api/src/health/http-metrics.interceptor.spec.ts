import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;

  beforeEach(() => {
    interceptor = new HttpMetricsInterceptor();
  });

  function mockContext() {
    return {} as any;
  }

  it('counts requests', async () => {
    const handler = { handle: () => of('result') };
    await new Promise<void>((resolve) => {
      interceptor
        .intercept(mockContext(), handler as any)
        .subscribe({ complete: resolve });
    });
    await new Promise<void>((resolve) => {
      interceptor
        .intercept(mockContext(), handler as any)
        .subscribe({ complete: resolve });
    });

    const metrics = interceptor.getMetrics();
    expect(metrics.requestsTotal).toBe(2);
    expect(metrics.errorsTotal).toBe(0);
    expect(metrics.errorRate).toBe(0);
  });

  it('counts errors', async () => {
    const handler = { handle: () => throwError(() => new Error('fail')) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(mockContext(), handler as any).subscribe({
        error: () => resolve(),
      });
    });

    const metrics = interceptor.getMetrics();
    expect(metrics.requestsTotal).toBe(1);
    expect(metrics.errorsTotal).toBe(1);
    expect(metrics.errorRate).toBe(1);
  });

  it('calculates latency metrics', async () => {
    const handler = { handle: () => of('result') };
    for (let i = 0; i < 10; i++) {
      await new Promise<void>((resolve) => {
        interceptor
          .intercept(mockContext(), handler as any)
          .subscribe({ complete: resolve });
      });
    }

    const metrics = interceptor.getMetrics();
    expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports uptime', () => {
    const metrics = interceptor.getMetrics();
    expect(metrics.uptime).toBeGreaterThan(0);
  });

  it('returns zero metrics when no requests', () => {
    const metrics = interceptor.getMetrics();
    expect(metrics.requestsTotal).toBe(0);
    expect(metrics.errorsTotal).toBe(0);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.avgLatencyMs).toBe(0);
    expect(metrics.p95LatencyMs).toBe(0);
  });
});
