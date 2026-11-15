import { Injectable } from '@nestjs/common';
import type { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventDto } from './ingestion.dto.js';

@Injectable()
export class IngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async submitBatch(
    projectId: string,
    organizationId: string,
    apiKeyId: string,
    events: EventDto[],
  ): Promise<{ eventCount: number }> {
    await this.prisma.$transaction([
      this.prisma.eventBatch.create({
        data: {
          organizationId,
          projectId,
          events: events as unknown as Prisma.InputJsonValue,
          eventCount: events.length,
        },
      }),
      this.prisma.projectApiKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date() },
      }),
    ]);

    return { eventCount: events.length };
  }
}
