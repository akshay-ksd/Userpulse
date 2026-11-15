import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';
import { ApiKeyGuard } from './api-key.guard.js';

@Module({
  controllers: [IngestionController],
  providers: [IngestionService, ApiKeyGuard],
})
export class IngestionModule {}
