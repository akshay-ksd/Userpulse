import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventValidationService } from './event-validation.service.js';
import type { EventDto } from './submit-events.dto.js';

export interface BatchResult {
  accepted: number;
  rejected: number;
  errors?: Array<{ index: number; error: string }>;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: EventValidationService,
  ) {}

  async submitBatch(
    organizationId: string,
    projectId: string,
    apiKeyId: string,
    batch: EventDto[],
  ): Promise<BatchResult> {
    const now = new Date();
    const validData: Prisma.EventCreateManyInput[] = [];
    const rejectedData: Prisma.EventCreateManyInput[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < batch.length; i++) {
      const result = this.validationService.validateAndNormalize(batch[i]);
      const normalized = result.normalized;

      const base = {
        organizationId,
        projectId,
        eventId: normalized.eventId,
        eventName: normalized.eventName,
        anonymousId: normalized.anonymousId ?? null,
        userId: normalized.userId ?? null,
        properties:
          (normalized.properties as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        sdkVersion: normalized.sdkVersion ?? null,
        eventTimestamp: new Date(normalized.timestamp),
      };

      if (result.status === 'VALID') {
        validData.push({ ...base, validationStatus: 'VALID' });
      } else {
        rejectedData.push({
          ...base,
          validationStatus: 'REJECTED',
          validationError: result.error ?? null,
        });
        errors.push({ index: i, error: result.error! });
      }
    }

    const promises: Promise<unknown>[] = [];
    if (validData.length > 0) {
      promises.push(this.prisma.event.createMany({ data: validData }));
    }
    if (rejectedData.length > 0) {
      promises.push(this.prisma.event.createMany({ data: rejectedData }));
    }
    await Promise.all(promises);

    if (rejectedData.length > 0) {
      this.logger.warn(
        `Event validation: ${rejectedData.length} rejected in batch for project ${projectId}`,
      );
    }

    this.prisma.projectApiKey
      .update({
        where: { id: apiKeyId },
        data: { lastUsedAt: now },
      })
      .catch(() => {});

    return {
      accepted: validData.length,
      rejected: rejectedData.length,
      ...(errors.length > 0 ? { errors } : {}),
    };
  }
}
