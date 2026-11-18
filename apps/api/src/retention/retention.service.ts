import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const DEFAULT_RETENTION_DAYS = 90;

export interface RetentionSettings {
  id: string;
  organizationId: string;
  eventRetentionDays: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async getRetentionSettings(
    orgId: string,
    userId: string,
  ): Promise<RetentionSettings> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });

    if (!membership) {
      throw new NotFoundException();
    }

    const existing = await this.prisma.dataRetentionSetting.findUnique({
      where: { organizationId: orgId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.dataRetentionSetting.create({
      data: {
        organizationId: orgId,
        eventRetentionDays: DEFAULT_RETENTION_DAYS,
      },
    });
  }

  async updateRetentionSettings(
    orgId: string,
    userId: string,
    eventRetentionDays: number,
  ): Promise<RetentionSettings> {
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
        'Only organization owners can update retention settings.',
      );
    }

    return this.prisma.dataRetentionSetting.upsert({
      where: { organizationId: orgId },
      update: { eventRetentionDays },
      create: {
        organizationId: orgId,
        eventRetentionDays,
      },
    });
  }

  getDefaultRetentionDays(): number {
    return DEFAULT_RETENTION_DAYS;
  }
}
