import { Controller, Get, Headers, ForbiddenException } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import {
  PlatformHealthService,
  type AggregatedMetrics,
} from './platform-health.service.js';

@Controller('internal/metrics')
export class HealthMetricsController {
  constructor(private readonly platformHealth: PlatformHealthService) {}

  @Public()
  @Get('health')
  async getHealthMetrics(
    @Headers('x-internal-token') token?: string,
  ): Promise<AggregatedMetrics> {
    const expected = process.env.INTERNAL_METRICS_TOKEN;
    if (!expected || token !== expected) {
      throw new ForbiddenException();
    }
    return this.platformHealth.getAggregatedMetrics();
  }
}
