import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';
import { AlertEvaluatorService } from './alert-evaluator.service.js';
import { PlatformHealthService } from './platform-health.service.js';

function mockPrisma() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    event: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    analysisRun: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    dataDeletionRequest: {
      count: vi.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;
}

describe('PlatformHealthService', () => {
  let service: PlatformHealthService;
  let prisma: PrismaService;
  let httpMetrics: HttpMetricsInterceptor;
  let alertEvaluator: AlertEvaluatorService;

  beforeEach(() => {
    prisma = mockPrisma();
    httpMetrics = new HttpMetricsInterceptor();
    alertEvaluator = new AlertEvaluatorService();
    service = new PlatformHealthService(prisma, httpMetrics, alertEvaluator);
  });

  it('returns aggregated metrics with all subsystems', async () => {
    const metrics = await service.getAggregatedMetrics();

    expect(metrics).toHaveProperty('api');
    expect(metrics).toHaveProperty('eventProcessing');
    expect(metrics).toHaveProperty('analysisRuns');
    expect(metrics).toHaveProperty('retention');
    expect(metrics).toHaveProperty('dataDeletion');
    expect(metrics).toHaveProperty('database');
    expect(metrics).toHaveProperty('alerts');
  });

  it('reports database as connected when query succeeds', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const metrics = await service.getAggregatedMetrics();
    expect(metrics.database.connected).toBe(true);
    expect(metrics.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('calculates analysis run metrics from status counts', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { status: 'QUEUED', count: BigInt(2) },
      { status: 'RUNNING', count: BigInt(1) },
      { status: 'COMPLETED', count: BigInt(10) },
      { status: 'FAILED', count: BigInt(3) },
    ]);

    (prisma.analysisRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [
        {
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 60000),
          completedAt: new Date(),
        },
        {
          status: 'FAILED',
          startedAt: new Date(Date.now() - 30000),
          completedAt: new Date(),
        },
      ],
    );

    const metrics = await service.getAnalysisRunMetrics();
    expect(metrics.queued).toBe(2);
    expect(metrics.running).toBe(1);
    expect(metrics.completed).toBe(10);
    expect(metrics.failed).toBe(3);
    expect(metrics.failureRate).toBe(0.5);
    expect(metrics.avgDurationMs).toBeGreaterThan(0);
  });

  it('handles zero analysis runs gracefully', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.analysisRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );

    const metrics = await service.getAnalysisRunMetrics();
    expect(metrics.failureRate).toBe(0);
    expect(metrics.avgDurationMs).toBeNull();
  });

  it('includes alerts from alert evaluator', async () => {
    vi.spyOn(alertEvaluator, 'evaluate').mockReturnValue([
      {
        level: 'critical',
        subsystem: 'test',
        message: 'test alert',
        value: 1,
        threshold: 0,
      },
    ]);

    const metrics = await service.getAggregatedMetrics();
    expect(metrics.alerts).toHaveLength(1);
    expect(metrics.alerts[0].level).toBe('critical');
  });
});
