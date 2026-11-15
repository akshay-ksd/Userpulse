import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { validateAndNormalize } from './event-validator.js';
import type { EventDto } from './ingestion.dto.js';

export interface SubmitBatchResult {
  eventCount: number;
  validEventCount: number;
  invalidEventCount: number;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitBatch(
    projectId: string,
    organizationId: string,
    apiKeyId: string,
    events: EventDto[],
  ): Promise<SubmitBatchResult> {
    const { valid, invalid } = validateAndNormalize(
      events,
      organizationId,
      projectId,
    );

    const [batch] = await this.prisma.$transaction([
      this.prisma.eventBatch.create({
        data: {
          organizationId,
          projectId,
          events: events as unknown as Prisma.InputJsonValue,
          eventCount: events.length,
          validEvents: valid as unknown as Prisma.InputJsonValue,
          invalidEvents: invalid as unknown as Prisma.InputJsonValue,
          validEventCount: valid.length,
          invalidEventCount: invalid.length,
          status: valid.length === 0 ? 'INVALID' : 'PENDING',
        },
        select: { id: true },
      }),
      this.prisma.projectApiKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date() },
      }),
    ]);

    if (invalid.length > 0) {
      const errorCounts: Record<string, number> = {};
      for (const { errors } of invalid) {
        for (const code of errors) {
          errorCounts[code] = (errorCounts[code] ?? 0) + 1;
        }
      }
      // Counts and codes only: event content and user identifiers are never logged.
      this.logger.warn({
        message: 'Event validation failures',
        batchId: batch.id,
        projectId,
        organizationId,
        eventCount: events.length,
        invalidEventCount: invalid.length,
        errorCounts,
      });
    }

    return {
      eventCount: events.length,
      validEventCount: valid.length,
      invalidEventCount: invalid.length,
    };
  }
}
