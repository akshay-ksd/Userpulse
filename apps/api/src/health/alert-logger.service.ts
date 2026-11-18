import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PlatformHealthService } from './platform-health.service.js';
import { AlertEvaluatorService } from './alert-evaluator.service.js';

const ALERT_CHECK_INTERVAL_MS = 60_000;

@Injectable()
export class AlertLoggerService {
  private readonly logger = new Logger(AlertLoggerService.name);

  constructor(
    private readonly platformHealth: PlatformHealthService,
    private readonly alertEvaluator: AlertEvaluatorService,
  ) {}

  @Interval(ALERT_CHECK_INTERVAL_MS)
  async checkAlerts(): Promise<void> {
    try {
      const metrics = await this.platformHealth.getAggregatedMetrics();

      for (const alert of metrics.alerts) {
        const logLine = `[ALERT:${alert.level.toUpperCase()}] subsystem=${alert.subsystem} message="${alert.message}" value=${alert.value} threshold=${alert.threshold}`;
        if (alert.level === 'critical') {
          this.logger.error(logLine);
        } else {
          this.logger.warn(logLine);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to check alerts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
