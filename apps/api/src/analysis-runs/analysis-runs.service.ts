import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RequestAnalysisDto } from './request-analysis.dto.js';

export interface AnalysisRunInfo {
  id: string;
  projectId: string;
  organizationId: string;
  requestedById: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  eventCount: number | null;
  statusMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class AnalysisRunsService {
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

  async requestAnalysis(
    orgId: string,
    projectId: string,
    userId: string,
    dto: RequestAnalysisDto,
  ): Promise<AnalysisRunInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const activeRun = await this.prisma.analysisRun.findFirst({
      where: {
        projectId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
    });

    if (activeRun) {
      throw new ConflictException(
        'An analysis is already in progress for this project.',
      );
    }

    return this.prisma.analysisRun.create({
      data: {
        projectId,
        organizationId: orgId,
        requestedById: userId,
        status: 'QUEUED',
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
      },
    });
  }

  async findByProject(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<AnalysisRunInfo[]> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    return this.prisma.analysisRun.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    orgId: string,
    projectId: string,
    runId: string,
    userId: string,
  ): Promise<AnalysisRunInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const run = await this.prisma.analysisRun.findFirst({
      where: { id: runId, projectId },
    });

    if (!run) {
      throw new NotFoundException();
    }

    return run;
  }
}
