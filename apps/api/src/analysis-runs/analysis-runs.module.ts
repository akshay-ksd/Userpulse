import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RecommendationsModule } from '../recommendations/recommendations.module.js';
import { AnalysisRunsController } from './analysis-runs.controller.js';
import { AnalysisRunsService } from './analysis-runs.service.js';
import { AnalysisRunProcessorService } from './analysis-run-processor.service.js';
import { AnalysisScheduleController } from './analysis-schedule.controller.js';
import { AnalysisScheduleService } from './analysis-schedule.service.js';
import { ScheduledAnalysisRunnerService } from './scheduled-analysis-runner.service.js';

@Module({
  imports: [PrismaModule, RecommendationsModule],
  controllers: [AnalysisRunsController, AnalysisScheduleController],
  providers: [
    AnalysisRunsService,
    AnalysisRunProcessorService,
    AnalysisScheduleService,
    ScheduledAnalysisRunnerService,
  ],
  exports: [AnalysisRunsService],
})
export class AnalysisRunsModule {}
