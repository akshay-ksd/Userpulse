import { Controller, Get } from '@nestjs/common';
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
  getMetrics(): Promise<DeletionMetrics> {
    return this.processorService.getMetrics();
  }
}
