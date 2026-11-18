import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AlertLoggerService } from './alert-logger.service.js';
import { PlatformHealthService } from './platform-health.service.js';
import { AlertEvaluatorService } from './alert-evaluator.service.js';

describe('AlertLoggerService', () => {
  let service: AlertLoggerService;
  let platformHealth: PlatformHealthService;

  beforeEach(() => {
    platformHealth = {
      getAggregatedMetrics: vi.fn().mockResolvedValue({
        api: {
          requestsTotal: 0,
          errorsTotal: 0,
          errorRate: 0,
          avgLatencyMs: 0,
          p95LatencyMs: 0,
          uptime: 100,
        },
        eventProcessing: {
          pending: 0,
          processed: 0,
          failed: 0,
          dlq: 0,
          oldestPendingAge: null,
          processedLast5min: 0,
        },
        analysisRuns: {
          queued: 0,
          running: 0,
          completed: 0,
          failed: 0,
          insufficientData: 0,
          failureRate: 0,
          avgDurationMs: null,
        },
        retention: {
          lastRunAt: null,
          eventsDeletedLastRun: 0,
          errorsLastRun: 0,
        },
        dataDeletion: { pendingRequests: 0 },
        database: { connected: true, latencyMs: 5 },
        alerts: [],
      }),
    } as unknown as PlatformHealthService;

    const alertEvaluator = new AlertEvaluatorService();
    service = new AlertLoggerService(platformHealth, alertEvaluator);
  });

  it('runs check without errors when all healthy', async () => {
    await service.checkAlerts();
    expect(platformHealth.getAggregatedMetrics).toHaveBeenCalled();
  });

  it('logs critical alerts', async () => {
    (
      platformHealth.getAggregatedMetrics as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      api: {
        requestsTotal: 0,
        errorsTotal: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        uptime: 100,
      },
      eventProcessing: {
        pending: 0,
        processed: 0,
        failed: 0,
        dlq: 0,
        oldestPendingAge: null,
        processedLast5min: 0,
      },
      analysisRuns: {
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        insufficientData: 0,
        failureRate: 0,
        avgDurationMs: null,
      },
      retention: { lastRunAt: null, eventsDeletedLastRun: 0, errorsLastRun: 0 },
      dataDeletion: { pendingRequests: 0 },
      database: { connected: true, latencyMs: 5 },
      alerts: [
        {
          level: 'critical',
          subsystem: 'eventProcessing',
          message: 'DLQ count (5) exceeds threshold',
          value: 5,
          threshold: 0,
        },
      ],
    });

    // Should not throw
    await service.checkAlerts();
  });

  it('handles errors gracefully', async () => {
    (
      platformHealth.getAggregatedMetrics as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('DB down'));

    // Should not throw
    await service.checkAlerts();
  });
});
