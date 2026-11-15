import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventValidationService } from './event-validation.service.js';
import { IngestionController } from './ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [IngestionController],
  providers: [IngestionService, EventValidationService],
})
export class IngestionModule {}
