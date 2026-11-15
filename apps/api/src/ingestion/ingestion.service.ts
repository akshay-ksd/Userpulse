import { Injectable } from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventDto } from './submit-events.dto.js';

export interface BatchResult {
  accepted: number;
}

@Injectable()
export class IngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async submitBatch(
    organizationId: string,
    projectId: string,
    apiKeyId: string,
    batch: EventDto[],
  ): Promise<BatchResult> {
    const now = new Date();

    const data = batch.map((event) => ({
      organizationId,
      projectId,
      eventId: event.eventId,
      eventName: event.eventName,
      anonymousId: event.anonymousId ?? null,
      userId: event.userId ?? null,
      properties:
        (event.properties as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      sdkVersion: event.sdkVersion ?? null,
      eventTimestamp: new Date(event.timestamp),
    }));

    await this.prisma.event.createMany({ data });

    this.prisma.projectApiKey
      .update({
        where: { id: apiKeyId },
        data: { lastUsedAt: now },
      })
      .catch(() => {
        // Fire-and-forget: don't fail ingestion if lastUsedAt update fails
      });

    return { accepted: batch.length };
  }
}
