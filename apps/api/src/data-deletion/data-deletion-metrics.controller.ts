import { Controller, Get, Headers, ForbiddenException } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import {
  DataDeletionProcessorService,
  type DeletionMetrics,
} from './data-deletion-processor.service.js';

@Controller('internal/metrics')
export class DataDeletionMetricsController {
  constructor(
    private readonly processorService: DataDeletionProcessorService,
  ) {}

  @Get('data-deletion')
  @Public()
  async getMetrics(
    @Headers('x-internal-token') token?: string,
  ): Promise<DeletionMetrics> {
    const expected = process.env.INTERNAL_METRICS_TOKEN;
    if (!expected || token !== expected) {
      throw new ForbiddenException();
    }
    return this.processorService.getMetrics();
  }
}
