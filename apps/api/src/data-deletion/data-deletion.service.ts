import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';

const CONSEQUENCES_TEXT =
  'This will permanently delete all tracked events, recommendations, analysis runs, funnels, features, feature mappings, API keys, and analysis schedules for this project. The project will be archived. This action cannot be undone. Note: data may persist in database backups according to the infrastructure backup retention policy.';

export interface DeletionScope {
  events: number;
  recommendations: number;
  analysisRuns: number;
  funnels: number;
  features: number;
  featureEventMappings: number;
  apiKeys: number;
  analysisSchedules: number;
}

export interface DeletionRequestInfo {
  id: string;
  projectId: string;
  organizationId: string;
  requestedBy: string;
  status: string;
  scope: DeletionScope;
  consequences: string;
  eventsDeleted: number;
  recordsDeleted: number;
  error: string | null;
  confirmedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class DataDeletionService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyOwner(orgId: string, userId: string): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });

    if (!membership) {
      throw new NotFoundException();
    }

    if (membership.role !== 'OWNER') {
      throw new ForbiddenException(
        'Only organization owners can manage data deletion requests.',
      );
    }
  }

  private async verifyMembership(orgId: string, userId: string): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });

    if (!membership) {
      throw new NotFoundException();
    }
  }

  private async computeScope(projectId: string): Promise<DeletionScope> {
    const [
      events,
      recommendations,
      analysisRuns,
      funnels,
      features,
      featureEventMappings,
      apiKeys,
      analysisSchedules,
    ] = await Promise.all([
      this.prisma.event.count({ where: { projectId } }),
      this.prisma.recommendation.count({ where: { projectId } }),
      this.prisma.analysisRun.count({ where: { projectId } }),
      this.prisma.funnel.count({ where: { projectId } }),
      this.prisma.feature.count({ where: { projectId } }),
      this.prisma.featureEventMapping.count({ where: { projectId } }),
      this.prisma.projectApiKey.count({ where: { projectId } }),
      this.prisma.analysisSchedule.count({ where: { projectId } }),
    ]);

    return {
      events,
      recommendations,
      analysisRuns,
      funnels,
      features,
      featureEventMappings,
      apiKeys,
      analysisSchedules,
    };
  }

  private toInfo(request: {
    id: string;
    projectId: string;
    organizationId: string;
    requestedBy: string;
    status: string;
    scope: unknown;
    eventsDeleted: number;
    recordsDeleted: number;
    error: string | null;
    confirmedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }): DeletionRequestInfo {
    return {
      id: request.id,
      projectId: request.projectId,
      organizationId: request.organizationId,
      requestedBy: request.requestedBy,
      status: request.status,
      scope: request.scope as DeletionScope,
      consequences: CONSEQUENCES_TEXT,
      eventsDeleted: request.eventsDeleted,
      recordsDeleted: request.recordsDeleted,
      error: request.error,
      confirmedAt: request.confirmedAt,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
      createdAt: request.createdAt,
    };
  }

  async createRequest(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<DeletionRequestInfo> {
    await this.verifyOwner(orgId, userId);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const activeRequest = await this.prisma.dataDeletionRequest.findFirst({
      where: {
        projectId,
        status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] },
      },
    });

    if (activeRequest) {
      throw new ConflictException(
        'An active deletion request already exists for this project.',
      );
    }

    const scope = await this.computeScope(projectId);

    const request = await this.prisma.dataDeletionRequest.create({
      data: {
        projectId,
        organizationId: orgId,
        requestedBy: userId,
        scope: scope as unknown as Prisma.InputJsonValue,
      },
    });

    return this.toInfo(request);
  }

  async confirmRequest(
    orgId: string,
    requestId: string,
    userId: string,
  ): Promise<DeletionRequestInfo> {
    await this.verifyOwner(orgId, userId);

    const request = await this.prisma.dataDeletionRequest.findFirst({
      where: { id: requestId, organizationId: orgId },
    });

    if (!request) {
      throw new NotFoundException('Deletion request not found.');
    }

    if (request.status !== 'PENDING') {
      throw new ConflictException('Only pending requests can be confirmed.');
    }

    const updated = await this.prisma.dataDeletionRequest.update({
      where: { id: requestId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });

    return this.toInfo(updated);
  }

  async listRequests(
    orgId: string,
    userId: string,
  ): Promise<DeletionRequestInfo[]> {
    await this.verifyMembership(orgId, userId);

    const requests = await this.prisma.dataDeletionRequest.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => this.toInfo(r));
  }

  async getRequest(
    orgId: string,
    requestId: string,
    userId: string,
  ): Promise<DeletionRequestInfo> {
    await this.verifyMembership(orgId, userId);

    const request = await this.prisma.dataDeletionRequest.findFirst({
      where: { id: requestId, organizationId: orgId },
    });

    if (!request) {
      throw new NotFoundException('Deletion request not found.');
    }

    return this.toInfo(request);
  }

  async cancelRequest(
    orgId: string,
    requestId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyOwner(orgId, userId);

    const request = await this.prisma.dataDeletionRequest.findFirst({
      where: { id: requestId, organizationId: orgId },
    });

    if (!request) {
      throw new NotFoundException('Deletion request not found.');
    }

    if (request.status !== 'PENDING') {
      throw new ConflictException('Only pending requests can be cancelled.');
    }

    await this.prisma.dataDeletionRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });
  }
}
