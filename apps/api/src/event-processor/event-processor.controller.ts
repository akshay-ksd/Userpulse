import { Controller, Get } from '@nestjs/common';
import { EventProcessorService } from './event-processor.service.js';

@Controller('internal/metrics')
export class EventProcessorController {
  constructor(private readonly eventProcessorService: EventProcessorService) {}

  @Get('processing')
  async getProcessingMetrics() {
    return this.eventProcessorService.getMetrics();
  }
}
