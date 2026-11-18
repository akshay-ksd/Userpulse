import { Controller, Get, Headers, ForbiddenException } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import {
  RetentionCleanupService,
  type CleanupMetrics,
} from './retention-cleanup.service.js';

@Controller('internal/metrics')
export class RetentionMetricsController {
  constructor(
    private readonly retentionCleanupService: RetentionCleanupService,
  ) {}

  @Public()
  @Get('retention')
  getRetentionMetrics(
    @Headers('x-internal-token') token?: string,
  ): CleanupMetrics {
    const expected = process.env.INTERNAL_METRICS_TOKEN;
    if (!expected || token !== expected) {
      throw new ForbiddenException();
    }
    return this.retentionCleanupService.getMetrics();
  }
}
