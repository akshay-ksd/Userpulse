import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateFeatureDto } from './create-feature.dto.js';
import type { UpdateFeatureDto } from './update-feature.dto.js';

export interface FeatureInfo {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  mappingCount: number;
}

export interface MappingInfo {
  id: string;
  featureId: string;
  projectId: string;
  eventName: string;
  createdAt: Date;
}

export interface UnmappedEventInfo {
  eventName: string;
  eventCount: number;
  lastSeenAt: Date;
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

  private async verifyFeatureAccess(
    orgId: string,
    projectId: string,
    featureId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const feature = await this.prisma.feature.findFirst({
      where: { id: featureId, projectId },
    });

    if (!feature) {
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
      mappingCount: 0,
    };
  }

  async update(
    orgId: string,
    projectId: string,
    featureId: string,
    userId: string,
    dto: UpdateFeatureDto,
  ): Promise<FeatureInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const feature = await this.prisma.feature.findFirst({
      where: { id: featureId, projectId },
    });

    if (!feature) {
      throw new NotFoundException();
    }

    const updated = await this.prisma.feature.update({
      where: { id: featureId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { _count: { select: { mappings: true } } },
    });

    return {
      id: updated.id,
      projectId: updated.projectId,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      createdAt: updated.createdAt,
      mappingCount: updated._count.mappings,
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
      include: { _count: { select: { mappings: true } } },
    });

    return features.map((f) => ({
      id: f.id,
      projectId: f.projectId,
      name: f.name,
      description: f.description,
      status: f.status,
      createdAt: f.createdAt,
      mappingCount: f._count.mappings,
    }));
  }

  async getMappings(
    orgId: string,
    projectId: string,
    featureId: string,
    userId: string,
  ): Promise<MappingInfo[]> {
    await this.verifyFeatureAccess(orgId, projectId, featureId, userId);

    const mappings = await this.prisma.featureEventMapping.findMany({
      where: { featureId },
      orderBy: { createdAt: 'asc' },
    });

    return mappings.map((m) => ({
      id: m.id,
      featureId: m.featureId,
      projectId: m.projectId,
      eventName: m.eventName,
      createdAt: m.createdAt,
    }));
  }

  async setMappings(
    orgId: string,
    projectId: string,
    featureId: string,
    userId: string,
    eventNames: string[],
  ): Promise<MappingInfo[]> {
    await this.verifyFeatureAccess(orgId, projectId, featureId, userId);

    const conflicts = await this.prisma.featureEventMapping.findMany({
      where: {
        projectId,
        eventName: { in: eventNames },
        featureId: { not: featureId },
      },
      include: { feature: { select: { name: true } } },
    });

    if (conflicts.length > 0) {
      const details = conflicts
        .map((c) => `"${c.eventName}" is already mapped to "${c.feature.name}"`)
        .join('; ');
      throw new ConflictException(`Event name conflict: ${details}`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.featureEventMapping.deleteMany({
        where: { featureId },
      });

      if (eventNames.length === 0) {
        return [];
      }

      await tx.featureEventMapping.createMany({
        data: eventNames.map((name) => ({
          featureId,
          projectId,
          eventName: name,
        })),
      });

      const created = await tx.featureEventMapping.findMany({
        where: { featureId },
        orderBy: { createdAt: 'asc' },
      });

      return created.map((m) => ({
        id: m.id,
        featureId: m.featureId,
        projectId: m.projectId,
        eventName: m.eventName,
        createdAt: m.createdAt,
      }));
    });
  }

  async removeMapping(
    orgId: string,
    projectId: string,
    featureId: string,
    mappingId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyFeatureAccess(orgId, projectId, featureId, userId);

    const mapping = await this.prisma.featureEventMapping.findFirst({
      where: { id: mappingId, featureId },
    });

    if (!mapping) {
      throw new NotFoundException();
    }

    await this.prisma.featureEventMapping.delete({
      where: { id: mappingId },
    });
  }

  async getUnmappedEvents(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<UnmappedEventInfo[]> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const eventGroups = await this.prisma.event.groupBy({
      by: ['eventName'],
      where: { projectId, validationStatus: 'VALID' },
      _count: { eventName: true },
      _max: { ingestedAt: true },
    });

    if (eventGroups.length === 0) {
      return [];
    }

    const mappedNames = await this.prisma.featureEventMapping.findMany({
      where: { projectId },
      select: { eventName: true },
    });

    const mappedSet = new Set(mappedNames.map((m) => m.eventName));

    return eventGroups
      .filter((g) => !mappedSet.has(g.eventName))
      .map((g) => ({
        eventName: g.eventName,
        eventCount: g._count.eventName,
        lastSeenAt: g._max.ingestedAt!,
      }))
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  }
}
