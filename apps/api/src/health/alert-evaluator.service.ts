import { Injectable } from '@nestjs/common';

export interface Alert {
  level: 'warning' | 'critical';
  subsystem: string;
  message: string;
  value: number;
  threshold: number;
}

const DLQ_THRESHOLD = 0;
const FAILED_EVENTS_THRESHOLD = 100;
const PENDING_AGE_THRESHOLD_MINUTES = 30;
const ANALYSIS_FAILURE_RATE_THRESHOLD = 0.5;
const API_ERROR_RATE_THRESHOLD = 0.1;
const DB_LATENCY_THRESHOLD_MS = 1000;

@Injectable()
export class AlertEvaluatorService {
  evaluate(metrics: {
    eventProcessing: {
      dlq: number;
      failed: number;
      oldestPendingAge: string | null;
    };
    analysisRuns: { failureRate: number };
    api: { errorRate: number };
    database: { latencyMs: number };
  }): Alert[] {
    const alerts: Alert[] = [];

    if (metrics.eventProcessing.dlq > DLQ_THRESHOLD) {
      alerts.push({
        level: 'critical',
        subsystem: 'eventProcessing',
        message: `DLQ count (${metrics.eventProcessing.dlq}) exceeds threshold`,
        value: metrics.eventProcessing.dlq,
        threshold: DLQ_THRESHOLD,
      });
    }

    if (metrics.eventProcessing.failed > FAILED_EVENTS_THRESHOLD) {
      alerts.push({
        level: 'warning',
        subsystem: 'eventProcessing',
        message: `Failed events (${metrics.eventProcessing.failed}) exceed threshold`,
        value: metrics.eventProcessing.failed,
        threshold: FAILED_EVENTS_THRESHOLD,
      });
    }

    if (metrics.eventProcessing.oldestPendingAge) {
      const ageMinutes = parseAgeMinutes(
        metrics.eventProcessing.oldestPendingAge,
      );
      if (ageMinutes > PENDING_AGE_THRESHOLD_MINUTES) {
        alerts.push({
          level: 'warning',
          subsystem: 'eventProcessing',
          message: `Oldest pending event age (${ageMinutes}min) exceeds threshold`,
          value: ageMinutes,
          threshold: PENDING_AGE_THRESHOLD_MINUTES,
        });
      }
    }

    if (metrics.analysisRuns.failureRate > ANALYSIS_FAILURE_RATE_THRESHOLD) {
      alerts.push({
        level: 'critical',
        subsystem: 'analysisRuns',
        message: `Analysis failure rate (${(metrics.analysisRuns.failureRate * 100).toFixed(1)}%) exceeds threshold`,
        value: metrics.analysisRuns.failureRate,
        threshold: ANALYSIS_FAILURE_RATE_THRESHOLD,
      });
    }

    if (metrics.api.errorRate > API_ERROR_RATE_THRESHOLD) {
      alerts.push({
        level: 'critical',
        subsystem: 'api',
        message: `API error rate (${(metrics.api.errorRate * 100).toFixed(1)}%) exceeds threshold`,
        value: metrics.api.errorRate,
        threshold: API_ERROR_RATE_THRESHOLD,
      });
    }

    if (metrics.database.latencyMs > DB_LATENCY_THRESHOLD_MS) {
      alerts.push({
        level: 'warning',
        subsystem: 'database',
        message: `Database latency (${metrics.database.latencyMs}ms) exceeds threshold`,
        value: metrics.database.latencyMs,
        threshold: DB_LATENCY_THRESHOLD_MS,
      });
    }

    return alerts;
  }
}

function parseAgeMinutes(age: string): number {
  const timestamp = new Date(age);
  if (isNaN(timestamp.getTime())) return 0;
  return (Date.now() - timestamp.getTime()) / 60_000;
}
