import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ScheduledAnalysisRunnerService {
  private readonly logger = new Logger(ScheduledAnalysisRunnerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Interval(60_000)
  async checkDueSchedules(): Promise<void> {
    try {
      const dueSchedules = await this.prisma.analysisSchedule.findMany({
        where: {
          enabled: true,
          nextRunAt: { lte: new Date() },
        },
      });

      for (const schedule of dueSchedules) {
        await this.processSchedule(schedule);
      }
    } catch (error) {
      this.logger.error(
        'Failed to check due schedules',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async processSchedule(schedule: {
    id: string;
    projectId: string;
    organizationId: string;
    intervalHours: number;
    createdBy: string;
    nextRunAt: Date;
  }): Promise<void> {
    try {
      const activeRun = await this.prisma.analysisRun.findFirst({
        where: {
          projectId: schedule.projectId,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
      });

      const nextRunAt = new Date(
        Date.now() + schedule.intervalHours * 60 * 60 * 1000,
      );

      if (activeRun) {
        this.logger.log(
          `Schedule ${schedule.id}: skipping, active run ${activeRun.id} exists`,
        );
        await this.prisma.analysisSchedule.update({
          where: { id: schedule.id },
          data: { nextRunAt },
        });
        return;
      }

      const now = new Date();
      const periodEnd = now;
      const periodStart = new Date(
        now.getTime() - schedule.intervalHours * 60 * 60 * 1000,
      );

      await this.prisma.analysisRun.create({
        data: {
          projectId: schedule.projectId,
          organizationId: schedule.organizationId,
          requestedById: schedule.createdBy,
          status: 'QUEUED',
          periodStart,
          periodEnd,
        },
      });

      await this.prisma.analysisSchedule.update({
        where: { id: schedule.id },
        data: { lastRunAt: now, nextRunAt },
      });

      this.logger.log(
        `Schedule ${schedule.id}: queued analysis run for project ${schedule.projectId}`,
      );
    } catch (error) {
      this.logger.error(
        `Schedule ${schedule.id}: failed to process`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
