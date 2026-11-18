import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProjectDto } from './create-project.dto.js';
import type { UpdateProjectDto } from './update-project.dto.js';

export interface ProjectInfo {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
}

export interface EventStatusInfo {
  totalEvents: number;
  latestEventAt: Date | null;
  earliestEventAt: Date | null;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(
    orgId: string,
    userId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectInfo> {
    await this.verifyMembership(orgId, userId);

    const project = await this.prisma.project.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        description: dto.description ?? null,
      },
    });

    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt,
    };
  }

  async findByOrganization(
    orgId: string,
    userId: string,
  ): Promise<ProjectInfo[]> {
    await this.verifyMembership(orgId, userId);

    const projects = await this.prisma.project.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    return projects.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      name: p.name,
      description: p.description,
      status: p.status,
      createdAt: p.createdAt,
    }));
  }

  async findOne(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectInfo> {
    await this.verifyMembership(orgId, userId);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });

    if (!project) {
      throw new NotFoundException();
    }

    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt,
    };
  }

  async update(
    orgId: string,
    projectId: string,
    userId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectInfo> {
    await this.verifyMembership(orgId, userId);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });

    if (!project) {
      throw new NotFoundException();
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      createdAt: updated.createdAt,
    };
  }

  async getEventStatus(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<EventStatusInfo> {
    await this.verifyMembership(orgId, userId);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });

    if (!project) {
      throw new NotFoundException();
    }

    const result = await this.prisma.event.aggregate({
      where: { projectId, validationStatus: 'VALID' },
      _count: true,
      _max: { ingestedAt: true },
      _min: { ingestedAt: true },
    });

    return {
      totalEvents: result._count,
      latestEventAt: result._max.ingestedAt,
      earliestEventAt: result._min.ingestedAt,
    };
  }
}
