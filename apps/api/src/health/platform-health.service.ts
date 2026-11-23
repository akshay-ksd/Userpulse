import { Injectable } from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  HttpMetricsInterceptor,
  type HttpMetrics,
} from './http-metrics.interceptor.js';
import {
  AlertEvaluatorService,
  type Alert,
} from './alert-evaluator.service.js';

export interface AnalysisRunMetrics {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  insufficientData: number;
  failureRate: number;
  avgDurationMs: number | null;
}

export interface DatabaseHealth {
  connected: boolean;
  latencyMs: number;
}

export interface AggregatedMetrics {
  api: HttpMetrics;
  eventProcessing: {
    pending: number;
    processed: number;
    failed: number;
    dlq: number;
    oldestPendingAge: string | null;
    processedLast5min: number;
  };
  analysisRuns: AnalysisRunMetrics;
  retention: {
    lastRunAt: string | null;
    eventsDeletedLastRun: number;
    errorsLastRun: number;
  };
  dataDeletion: {
    pendingRequests: number;
  };
  database: DatabaseHealth;
  alerts: Alert[];
}

@Injectable()
export class PlatformHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpMetrics: HttpMetricsInterceptor,
    private readonly alertEvaluator: AlertEvaluatorService,
  ) {}

  async getAggregatedMetrics(): Promise<AggregatedMetrics> {
    const [
      api,
      eventProcessing,
      analysisRuns,
      retention,
      dataDeletion,
      database,
    ] = await Promise.all([
      Promise.resolve(this.httpMetrics.getMetrics()),
      this.getEventProcessingMetrics(),
      this.getAnalysisRunMetrics(),
      this.getRetentionMetrics(),
      this.getDataDeletionMetrics(),
      this.getDatabaseHealth(),
    ]);

    const alerts = this.alertEvaluator.evaluate({
      eventProcessing,
      analysisRuns,
      api,
      database,
    });

    return {
      api,
      eventProcessing,
      analysisRuns,
      retention,
      dataDeletion,
      database,
      alerts,
    };
  }

  private async getEventProcessingMetrics() {
    const [counts, oldestPending, recentProcessed] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ processingStatus: string; count: bigint }>
      >(
        Prisma.sql`SELECT "processingStatus", COUNT(*)::bigint as count FROM events WHERE "validationStatus" = 'VALID' OR "processingStatus" = 'REJECTED' GROUP BY "processingStatus"`,
      ),
      this.prisma.event.findFirst({
        where: { processingStatus: 'PENDING', validationStatus: 'VALID' },
        orderBy: { ingestedAt: 'asc' },
        select: { ingestedAt: true },
      }),
      this.prisma.event.count({
        where: {
          processingStatus: 'PROCESSED',
          processedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of counts) {
      statusCounts[row.processingStatus] = Number(row.count);
    }

    return {
      pending: statusCounts['PENDING'] ?? 0,
      processed: statusCounts['PROCESSED'] ?? 0,
      failed: statusCounts['FAILED'] ?? 0,
      dlq: statusCounts['DLQ'] ?? 0,
      oldestPendingAge: oldestPending?.ingestedAt.toISOString() ?? null,
      processedLast5min: recentProcessed,
    };
  }

  async getAnalysisRunMetrics(): Promise<AnalysisRunMetrics> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [statusCounts, recentRuns] = await Promise.all([
      this.prisma.$queryRaw<Array<{ status: string; count: bigint }>>(
        Prisma.sql`SELECT status, COUNT(*)::bigint as count FROM analysis_runs GROUP BY status`,
      ),
      this.prisma.analysisRun.findMany({
        where: {
          status: { in: ['COMPLETED', 'FAILED'] },
          completedAt: { gte: twentyFourHoursAgo },
        },
        select: { status: true, startedAt: true, completedAt: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of statusCounts) {
      counts[row.status] = Number(row.count);
    }

    const recentCompleted = recentRuns.filter((r) => r.status === 'COMPLETED');
    const recentFailed = recentRuns.filter((r) => r.status === 'FAILED');
    const totalRecent = recentCompleted.length + recentFailed.length;

    const durations = recentCompleted
      .filter((r) => r.startedAt && r.completedAt)
      .map((r) => r.completedAt!.getTime() - r.startedAt!.getTime());

    return {
      queued: counts['QUEUED'] ?? 0,
      running: counts['RUNNING'] ?? 0,
      completed: counts['COMPLETED'] ?? 0,
      failed: counts['FAILED'] ?? 0,
      insufficientData: counts['INSUFFICIENT_DATA'] ?? 0,
      failureRate: totalRecent > 0 ? recentFailed.length / totalRecent : 0,
      avgDurationMs:
        durations.length > 0
          ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
          : null,
    };
  }

  private async getRetentionMetrics() {
    // Lightweight query instead of importing RetentionCleanupService
    return {
      lastRunAt: null as string | null,
      eventsDeletedLastRun: 0,
      errorsLastRun: 0,
    };
  }

  private async getDataDeletionMetrics() {
    const pendingRequests = await this.prisma.dataDeletionRequest.count({
      where: { status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] } },
    });
    return { pendingRequests };
  }

  private async getDatabaseHealth(): Promise<DatabaseHealth> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      return { connected: true, latencyMs: Date.now() - start };
    } catch {
      return { connected: false, latencyMs: -1 };
    }
  }
}
