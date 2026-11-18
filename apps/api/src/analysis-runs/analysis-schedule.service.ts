import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpsertScheduleDto } from './analysis-schedule.dto.js';

export interface AnalysisScheduleInfo {
  id: string;
  projectId: string;
  organizationId: string;
  intervalHours: number;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
}

@Injectable()
export class AnalysisScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyProjectAccess(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });

    if (!membership) {
      throw new NotFoundException();
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });

    if (!project) {
      throw new NotFoundException();
    }
  }

  async upsert(
    orgId: string,
    projectId: string,
    userId: string,
    dto: UpsertScheduleDto,
  ): Promise<AnalysisScheduleInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const nextRunAt = new Date(Date.now() + dto.intervalHours * 60 * 60 * 1000);

    return this.prisma.analysisSchedule.upsert({
      where: { projectId },
      create: {
        projectId,
        organizationId: orgId,
        intervalHours: dto.intervalHours,
        enabled: dto.enabled,
        nextRunAt,
        createdBy: userId,
        updatedBy: userId,
      },
      update: {
        intervalHours: dto.intervalHours,
        enabled: dto.enabled,
        nextRunAt,
        updatedBy: userId,
      },
    });
  }

  async findByProject(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<AnalysisScheduleInfo | null> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    return this.prisma.analysisSchedule.findUnique({
      where: { projectId },
    });
  }

  async disable(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<AnalysisScheduleInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const schedule = await this.prisma.analysisSchedule.findUnique({
      where: { projectId },
    });

    if (!schedule) {
      throw new NotFoundException();
    }

    return this.prisma.analysisSchedule.update({
      where: { projectId },
      data: { enabled: false, updatedBy: userId },
    });
  }
}
