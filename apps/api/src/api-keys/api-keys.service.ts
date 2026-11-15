import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateApiKeyDto } from './create-api-key.dto.js';

export interface ApiKeyCreated {
  id: string;
  name: string;
  keyPrefix: string;
  key: string;
  createdAt: Date;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyMembershipAndProject(
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
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyCreated> {
    await this.verifyMembershipAndProject(orgId, projectId, userId);

    const rawKey = randomBytes(32).toString('base64url');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 8);

    const record = await this.prisma.projectApiKey.create({
      data: {
        projectId,
        name: dto.name,
        keyHash,
        keyPrefix,
        createdBy: userId,
      },
    });

    return {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      key: rawKey,
      createdAt: record.createdAt,
    };
  }

  async findByProject(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<ApiKeyInfo[]> {
    await this.verifyMembershipAndProject(orgId, projectId, userId);

    const keys = await this.prisma.projectApiKey.findMany({
      where: { projectId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    }));
  }
}
