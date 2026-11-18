import { describe, expect, it, beforeEach } from 'vitest';
import { AlertEvaluatorService } from './alert-evaluator.service.js';

describe('AlertEvaluatorService', () => {
  let service: AlertEvaluatorService;

  beforeEach(() => {
    service = new AlertEvaluatorService();
  });

  function healthyMetrics() {
    return {
      eventProcessing: {
        dlq: 0,
        failed: 0,
        oldestPendingAge: null as string | null,
      },
      analysisRuns: { failureRate: 0 },
      api: { errorRate: 0 },
      database: { latencyMs: 10 },
    };
  }

  it('returns no alerts for healthy metrics', () => {
    const alerts = service.evaluate(healthyMetrics());
    expect(alerts).toHaveLength(0);
  });

  it('triggers critical alert for DLQ events', () => {
    const metrics = healthyMetrics();
    metrics.eventProcessing.dlq = 5;
    const alerts = service.evaluate(metrics);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('critical');
    expect(alerts[0].subsystem).toBe('eventProcessing');
  });

  it('triggers warning for failed events above threshold', () => {
    const metrics = healthyMetrics();
    metrics.eventProcessing.failed = 150;
    const alerts = service.evaluate(metrics);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('warning');
    expect(alerts[0].subsystem).toBe('eventProcessing');
  });

  it('triggers warning for old pending events', () => {
    const metrics = healthyMetrics();
    const thirtyFiveMinutesAgo = new Date(
      Date.now() - 35 * 60 * 1000,
    ).toISOString();
    metrics.eventProcessing.oldestPendingAge = thirtyFiveMinutesAgo;
    const alerts = service.evaluate(metrics);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('warning');
  });

  it('triggers critical alert for high analysis failure rate', () => {
    const metrics = healthyMetrics();
    metrics.analysisRuns.failureRate = 0.6;
    const alerts = service.evaluate(metrics);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('critical');
    expect(alerts[0].subsystem).toBe('analysisRuns');
  });

  it('triggers critical alert for high API error rate', () => {
    const metrics = healthyMetrics();
    metrics.api.errorRate = 0.15;
    const alerts = service.evaluate(metrics);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('critical');
    expect(alerts[0].subsystem).toBe('api');
  });

  it('triggers warning for high database latency', () => {
    const metrics = healthyMetrics();
    metrics.database.latencyMs = 1500;
    const alerts = service.evaluate(metrics);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('warning');
    expect(alerts[0].subsystem).toBe('database');
  });

  it('returns multiple alerts when multiple thresholds are exceeded', () => {
    const metrics = healthyMetrics();
    metrics.eventProcessing.dlq = 3;
    metrics.api.errorRate = 0.2;
    metrics.database.latencyMs = 2000;
    const alerts = service.evaluate(metrics);
    expect(alerts).toHaveLength(3);
  });

  it('does not trigger alert for pending age below threshold', () => {
    const metrics = healthyMetrics();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    metrics.eventProcessing.oldestPendingAge = fiveMinutesAgo;
    const alerts = service.evaluate(metrics);
    expect(alerts).toHaveLength(0);
  });
});
