import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RetentionController } from './retention.controller.js';
import { RetentionService } from './retention.service.js';
import { RetentionCleanupService } from './retention-cleanup.service.js';
import { RetentionMetricsController } from './retention-metrics.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [RetentionController, RetentionMetricsController],
  providers: [RetentionService, RetentionCleanupService],
  exports: [RetentionService],
})
export class RetentionModule {}
