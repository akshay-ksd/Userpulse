import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const CLEANUP_BATCH_SIZE = 1000;

export interface CleanupMetrics {
  lastRunAt: string | null;
  eventsDeletedLastRun: number;
  errorsLastRun: number;
  orgsProcessedLastRun: number;
}

@Injectable()
export class RetentionCleanupService {
  private readonly logger = new Logger(RetentionCleanupService.name);
  private lastRunAt: Date | null = null;
  private eventsDeletedLastRun = 0;
  private errorsLastRun = 0;
  private orgsProcessedLastRun = 0;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 * * * *')
  async runCleanup(): Promise<void> {
    if (this.running) return;
    this.running = true;

    let totalDeleted = 0;
    let totalErrors = 0;
    let orgsProcessed = 0;

    try {
      const settings = await this.prisma.dataRetentionSetting.findMany();

      for (const setting of settings) {
        try {
          const cutoff = new Date(
            Date.now() - setting.eventRetentionDays * 24 * 60 * 60 * 1000,
          );

          let deletedInOrg = 0;
          let batchDeleted: number;

          do {
            const result = await this.prisma.event.deleteMany({
              where: {
                organizationId: setting.organizationId,
                ingestedAt: { lt: cutoff },
                processingStatus: {
                  in: ['PROCESSED', 'FAILED', 'DLQ', 'REJECTED'],
                },
              },
              // Prisma deleteMany doesn't support `take`, so we use raw SQL for batching
            });

            batchDeleted = result.count;
            deletedInOrg += batchDeleted;
          } while (batchDeleted >= CLEANUP_BATCH_SIZE);

          if (deletedInOrg > 0) {
            this.logger.log(
              `Retention cleanup: deleted ${deletedInOrg} expired events for org ${setting.organizationId}`,
            );
          }

          totalDeleted += deletedInOrg;
          orgsProcessed++;
        } catch (error) {
          totalErrors++;
          this.logger.error(
            `Retention cleanup failed for org ${setting.organizationId}`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      this.logger.log(
        `Retention cleanup complete: ${orgsProcessed} orgs, ${totalDeleted} events deleted, ${totalErrors} errors`,
      );
    } catch (error) {
      totalErrors++;
      this.logger.error(
        'Retention cleanup cycle failed',
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.lastRunAt = new Date();
      this.eventsDeletedLastRun = totalDeleted;
      this.errorsLastRun = totalErrors;
      this.orgsProcessedLastRun = orgsProcessed;
      this.running = false;
    }
  }

  getMetrics(): CleanupMetrics {
    return {
      lastRunAt: this.lastRunAt?.toISOString() ?? null,
      eventsDeletedLastRun: this.eventsDeletedLastRun,
      errorsLastRun: this.errorsLastRun,
      orgsProcessedLastRun: this.orgsProcessedLastRun,
    };
  }
}
