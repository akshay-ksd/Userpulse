import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DataDeletionController } from './data-deletion.controller.js';
import { DataDeletionService } from './data-deletion.service.js';
import { DataDeletionProcessorService } from './data-deletion-processor.service.js';
import { DataDeletionMetricsController } from './data-deletion-metrics.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [DataDeletionController, DataDeletionMetricsController],
  providers: [DataDeletionService, DataDeletionProcessorService],
})
export class DataDeletionModule {}
