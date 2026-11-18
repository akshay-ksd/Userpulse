import { Controller, Get, Headers, ForbiddenException } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { EventProcessorService } from './event-processor.service.js';

@Controller('internal/metrics')
export class EventProcessorController {
  constructor(private readonly eventProcessorService: EventProcessorService) {}

  @Public()
  @Get('processing')
  async getProcessingMetrics(@Headers('x-internal-token') token?: string) {
    const expected = process.env.INTERNAL_METRICS_TOKEN;
    if (!expected || token !== expected) {
      throw new ForbiddenException();
    }
    return this.eventProcessorService.getMetrics();
  }
}
