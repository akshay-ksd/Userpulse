import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const EVENT_DELETE_BATCH_SIZE = 1000;

export interface DeletionMetrics {
  lastRunAt: string | null;
  requestsProcessedLastRun: number;
  errorsLastRun: number;
  pendingRequests: number;
}

@Injectable()
export class DataDeletionProcessorService {
  private readonly logger = new Logger(DataDeletionProcessorService.name);
  private lastRunAt: Date | null = null;
  private requestsProcessedLastRun = 0;
  private errorsLastRun = 0;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Interval(10000)
  async processNextRequest(): Promise<void> {
    if (this.running) return;
    this.running = true;

    let processed = 0;
    let errors = 0;

    try {
      const requests = await this.prisma.dataDeletionRequest.findMany({
        where: { status: 'CONFIRMED' },
        orderBy: { createdAt: 'asc' },
        take: 1,
      });

      for (const request of requests) {
        try {
          await this.prisma.dataDeletionRequest.update({
            where: { id: request.id },
            data: { status: 'PROCESSING', startedAt: new Date() },
          });

          const counts = await this.deleteProjectData(request.projectId);

          await this.prisma.project.update({
            where: { id: request.projectId },
            data: { status: 'ARCHIVED' },
          });

          await this.prisma.dataDeletionRequest.update({
            where: { id: request.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              eventsDeleted: counts.events,
              recordsDeleted: counts.total,
            },
          });

          this.logger.log(
            `Data deletion completed for project ${request.projectId}: ${counts.total} records deleted (${counts.events} events)`,
          );
          processed++;
        } catch (error) {
          errors++;
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Data deletion failed for request ${request.id}`,
            message,
          );

          await this.prisma.dataDeletionRequest
            .update({
              where: { id: request.id },
              data: { status: 'FAILED', error: message },
            })
            .catch(() => {});
        }
      }
    } catch (error) {
      errors++;
      this.logger.error(
        'Data deletion processor cycle failed',
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.lastRunAt = new Date();
      this.requestsProcessedLastRun = processed;
      this.errorsLastRun = errors;
      this.running = false;
    }
  }

  private async deleteProjectData(
    projectId: string,
  ): Promise<{ events: number; total: number }> {
    let totalDeleted = 0;

    // 1. RecommendationStatusHistory (via recommendation relation)
    const statusHistory =
      await this.prisma.recommendationStatusHistory.deleteMany({
        where: { recommendation: { projectId } },
      });
    totalDeleted += statusHistory.count;

    // 2. Recommendations
    const recommendations = await this.prisma.recommendation.deleteMany({
      where: { projectId },
    });
    totalDeleted += recommendations.count;

    // 3. AnalysisRuns
    const analysisRuns = await this.prisma.analysisRun.deleteMany({
      where: { projectId },
    });
    totalDeleted += analysisRuns.count;

    // 4. AnalysisSchedule
    const schedules = await this.prisma.analysisSchedule.deleteMany({
      where: { projectId },
    });
    totalDeleted += schedules.count;

    // 5. FunnelSteps (via funnel relation)
    const funnelSteps = await this.prisma.funnelStep.deleteMany({
      where: { funnel: { projectId } },
    });
    totalDeleted += funnelSteps.count;

    // 6. Funnels
    const funnels = await this.prisma.funnel.deleteMany({
      where: { projectId },
    });
    totalDeleted += funnels.count;

    // 7. FeatureEventMappings
    const mappings = await this.prisma.featureEventMapping.deleteMany({
      where: { projectId },
    });
    totalDeleted += mappings.count;

    // 8. Features
    const features = await this.prisma.feature.deleteMany({
      where: { projectId },
    });
    totalDeleted += features.count;

    // 9. Events (batched)
    let eventsDeleted = 0;
    let batchDeleted: number;
    do {
      const result = await this.prisma.event.deleteMany({
        where: { projectId },
      });
      batchDeleted = result.count;
      eventsDeleted += batchDeleted;
    } while (batchDeleted >= EVENT_DELETE_BATCH_SIZE);
    totalDeleted += eventsDeleted;

    // 10. API Keys
    const apiKeys = await this.prisma.projectApiKey.deleteMany({
      where: { projectId },
    });
    totalDeleted += apiKeys.count;

    return { events: eventsDeleted, total: totalDeleted };
  }

  async getMetrics(): Promise<DeletionMetrics> {
    const pendingRequests = await this.prisma.dataDeletionRequest.count({
      where: { status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] } },
    });

    return {
      lastRunAt: this.lastRunAt?.toISOString() ?? null,
      requestsProcessedLastRun: this.requestsProcessedLastRun,
      errorsLastRun: this.errorsLastRun,
      pendingRequests,
    };
  }
}
