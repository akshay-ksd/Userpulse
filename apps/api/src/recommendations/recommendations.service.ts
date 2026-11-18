import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RecommendationInfo {
  id: string;
  analysisRunId: string;
  projectId: string;
  organizationId: string;
  title: string;
  summary: string;
  suggestedAction: string;
  category: string;
  affectedFeatureId: string | null;
  affectedArea: string | null;
  evidence: unknown;
  confidence: number | null;
  impact: number | null;
  reach: number | null;
  priorityScore: number | null;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  supersededById: string | null;
  createdAt: Date;
}

@Injectable()
export class RecommendationsService {
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

  private static readonly VALID_STATUSES = [
    'PUBLISHED',
    'ACCEPTED',
    'REJECTED',
    'DEFERRED',
  ];

  async findByProject(
    orgId: string,
    projectId: string,
    userId: string,
    status?: string,
  ): Promise<RecommendationInfo[]> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const where: { projectId: string; status?: string } = { projectId };
    if (status && RecommendationsService.VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    return this.prisma.recommendation.findMany({
      where,
      orderBy: [
        { priorityScore: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(
    orgId: string,
    projectId: string,
    recommendationId: string,
    userId: string,
  ): Promise<RecommendationInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const rec = await this.prisma.recommendation.findFirst({
      where: { id: recommendationId, projectId },
    });

    if (!rec) {
      throw new NotFoundException();
    }

    return rec;
  }

  async findByAnalysisRun(
    orgId: string,
    projectId: string,
    runId: string,
    userId: string,
  ): Promise<RecommendationInfo[]> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const run = await this.prisma.analysisRun.findFirst({
      where: { id: runId, projectId },
    });

    if (!run) {
      throw new NotFoundException();
    }

    return this.prisma.recommendation.findMany({
      where: { analysisRunId: runId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
