import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateFunnelDto } from './create-funnel.dto.js';
import type { UpdateFunnelDto } from './update-funnel.dto.js';

export interface FunnelStepInfo {
  id: string;
  stepOrder: number;
  eventName: string;
}

export interface FunnelInfo {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  stepCount: number;
}

export interface FunnelDetailInfo {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  steps: FunnelStepInfo[];
}

@Injectable()
export class FunnelsService {
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

  async create(
    orgId: string,
    projectId: string,
    userId: string,
    dto: CreateFunnelDto,
  ): Promise<FunnelDetailInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const funnel = await this.prisma.$transaction(async (tx) => {
      const created = await tx.funnel.create({
        data: {
          projectId,
          name: dto.name,
        },
      });

      await tx.funnelStep.createMany({
        data: dto.steps.map((step, index) => ({
          funnelId: created.id,
          stepOrder: index,
          eventName: step.eventName,
        })),
      });

      return tx.funnel.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          steps: { orderBy: { stepOrder: 'asc' } },
        },
      });
    });

    return this.toDetailInfo(funnel);
  }

  async findByProject(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<FunnelInfo[]> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const funnels = await this.prisma.funnel.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { steps: true } } },
    });

    return funnels.map((f) => ({
      id: f.id,
      projectId: f.projectId,
      name: f.name,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      stepCount: f._count.steps,
    }));
  }

  async findOne(
    orgId: string,
    projectId: string,
    userId: string,
    funnelId: string,
  ): Promise<FunnelDetailInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const funnel = await this.prisma.funnel.findFirst({
      where: { id: funnelId, projectId },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });

    if (!funnel) {
      throw new NotFoundException();
    }

    return this.toDetailInfo(funnel);
  }

  async update(
    orgId: string,
    projectId: string,
    userId: string,
    funnelId: string,
    dto: UpdateFunnelDto,
  ): Promise<FunnelDetailInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const existing = await this.prisma.funnel.findFirst({
      where: { id: funnelId, projectId },
    });

    if (!existing) {
      throw new NotFoundException();
    }

    const funnel = await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined) {
        await tx.funnel.update({
          where: { id: funnelId },
          data: { name: dto.name },
        });
      }

      if (dto.steps !== undefined) {
        await tx.funnelStep.deleteMany({
          where: { funnelId },
        });

        await tx.funnelStep.createMany({
          data: dto.steps.map((step, index) => ({
            funnelId,
            stepOrder: index,
            eventName: step.eventName,
          })),
        });
      }

      return tx.funnel.findUniqueOrThrow({
        where: { id: funnelId },
        include: {
          steps: { orderBy: { stepOrder: 'asc' } },
        },
      });
    });

    return this.toDetailInfo(funnel);
  }

  async remove(
    orgId: string,
    projectId: string,
    userId: string,
    funnelId: string,
  ): Promise<void> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const funnel = await this.prisma.funnel.findFirst({
      where: { id: funnelId, projectId },
    });

    if (!funnel) {
      throw new NotFoundException();
    }

    await this.prisma.funnel.delete({
      where: { id: funnelId },
    });
  }

  async getProjectEventNames(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<string[]> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const groups = await this.prisma.event.groupBy({
      by: ['eventName'],
      where: { projectId, processingStatus: 'PROCESSED' },
    });

    return groups.map((g) => g.eventName).sort();
  }

  private toDetailInfo(funnel: {
    id: string;
    projectId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    steps: { id: string; stepOrder: number; eventName: string }[];
  }): FunnelDetailInfo {
    return {
      id: funnel.id,
      projectId: funnel.projectId,
      name: funnel.name,
      createdAt: funnel.createdAt,
      updatedAt: funnel.updatedAt,
      steps: funnel.steps.map((s) => ({
        id: s.id,
        stepOrder: s.stepOrder,
        eventName: s.eventName,
      })),
    };
  }
}
