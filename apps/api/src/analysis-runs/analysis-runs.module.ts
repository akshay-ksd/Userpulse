import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RecommendationsModule } from '../recommendations/recommendations.module.js';
import { AnalysisRunsController } from './analysis-runs.controller.js';
import { AnalysisRunsService } from './analysis-runs.service.js';
import { AnalysisRunProcessorService } from './analysis-run-processor.service.js';

@Module({
  imports: [PrismaModule, RecommendationsModule],
  controllers: [AnalysisRunsController],
  providers: [AnalysisRunsService, AnalysisRunProcessorService],
  exports: [AnalysisRunsService],
})
export class AnalysisRunsModule {}
