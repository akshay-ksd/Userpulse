import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProjectDto } from './create-project.dto.js';

export interface ProjectInfo {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
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
      where: { organizationId: orgId, status: 'ACTIVE' },
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
}
