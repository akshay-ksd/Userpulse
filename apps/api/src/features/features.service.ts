import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateFeatureDto } from './create-feature.dto.js';

export interface FeatureInfo {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
}

@Injectable()
export class FeaturesService {
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
    dto: CreateFeatureDto,
  ): Promise<FeatureInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const feature = await this.prisma.feature.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description ?? null,
      },
    });

    return {
      id: feature.id,
      projectId: feature.projectId,
      name: feature.name,
      description: feature.description,
      status: feature.status,
      createdAt: feature.createdAt,
    };
  }

  async findByProject(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<FeatureInfo[]> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const features = await this.prisma.feature.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return features.map((f) => ({
      id: f.id,
      projectId: f.projectId,
      name: f.name,
      description: f.description,
      status: f.status,
      createdAt: f.createdAt,
    }));
  }
}
