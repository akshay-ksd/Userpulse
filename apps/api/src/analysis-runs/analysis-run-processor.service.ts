import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';

const MIN_EVENT_COUNT = 10;

@Injectable()
export class AnalysisRunProcessorService {
  private readonly logger = new Logger(AnalysisRunProcessorService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Interval(10_000)
  async processNextRun(): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const runs: Array<{ id: string }> = await tx.$queryRaw(
          Prisma.sql`SELECT id FROM analysis_runs WHERE status = 'QUEUED' ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
        );

        if (runs.length === 0) {
          return;
        }

        const runId = runs[0].id;

        await tx.analysisRun.update({
          where: { id: runId },
          data: { status: 'RUNNING', startedAt: new Date() },
        });

        const run = await tx.analysisRun.findUniqueOrThrow({
          where: { id: runId },
        });

        try {
          const eventCount = await tx.event.count({
            where: {
              projectId: run.projectId,
              validationStatus: 'VALID',
              processingStatus: 'PROCESSED',
              eventTimestamp: {
                gte: run.periodStart,
                lte: run.periodEnd,
              },
            },
          });

          if (eventCount < MIN_EVENT_COUNT) {
            await tx.analysisRun.update({
              where: { id: runId },
              data: {
                status: 'INSUFFICIENT_DATA',
                eventCount,
                statusMessage: `Insufficient data: only ${eventCount} valid events found in the analysis period. At least ${MIN_EVENT_COUNT} events are required.`,
                completedAt: new Date(),
              },
            });
            this.logger.log(
              `Analysis run ${runId}: insufficient data (${eventCount} events)`,
            );
            return;
          }

          await tx.analysisRun.update({
            where: { id: runId },
            data: {
              status: 'COMPLETED',
              eventCount,
              completedAt: new Date(),
            },
          });
          this.logger.log(
            `Analysis run ${runId}: completed with ${eventCount} events`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          await tx.analysisRun.update({
            where: { id: runId },
            data: {
              status: 'FAILED',
              statusMessage: `Analysis failed: ${message}`,
              completedAt: new Date(),
            },
          });
          this.logger.error(`Analysis run ${runId} failed: ${message}`);
        }
      });
    } catch (error) {
      this.logger.error(
        'Failed to process analysis run',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
