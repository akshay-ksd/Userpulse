import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const BATCH_SIZE = 500;
const MAX_RETRIES = 5;
const RETRY_BACKOFF_SECONDS = 30;
const POLL_INTERVAL_MS = 5_000;

@Injectable()
export class EventProcessorService {
  private readonly logger = new Logger(EventProcessorService.name);
  private processing = false;

  constructor(private readonly prisma: PrismaService) {}

  @Interval(POLL_INTERVAL_MS)
  async processNextBatch(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    const start = Date.now();
    let processed = 0;
    let failed = 0;
    let dlq = 0;

    try {
      const eventIds = await this.claimBatch();
      if (eventIds.length === 0) return;

      for (const id of eventIds) {
        try {
          await this.processEvent(id);
          processed++;
        } catch (error) {
          const result = await this.handleFailure(id, error);
          if (result === 'DLQ') {
            dlq++;
          }
          failed++;
        }
      }

      const duration = Date.now() - start;
      this.logger.log(
        `Processed batch: ${processed} succeeded, ${failed} failed, ${dlq} moved to DLQ (${duration}ms)`,
      );
    } catch (error) {
      this.logger.error('Event processing cycle failed', error);
    } finally {
      this.processing = false;
    }
  }

  private async claimBatch(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM events
      WHERE (
        processing_status = 'PENDING'
        AND validation_status = 'VALID'
      ) OR (
        processing_status = 'FAILED'
        AND retry_count < ${MAX_RETRIES}
        AND ingested_at < NOW() - INTERVAL '1 second' * ${RETRY_BACKOFF_SECONDS} * retry_count
      )
      ORDER BY ingested_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;
    return rows.map((r) => r.id);
  }

  private async processEvent(id: string): Promise<void> {
    // MVP: mark event as processed. In production, this is where
    // ClickHouse insert would go.
    await this.prisma.event.update({
      where: { id },
      data: {
        processingStatus: 'PROCESSED',
        processedAt: new Date(),
        processingError: null,
      },
    });
  }

  private async handleFailure(
    id: string,
    error: unknown,
  ): Promise<'FAILED' | 'DLQ'> {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: { retryCount: true },
    });

    const retryCount = (event?.retryCount ?? 0) + 1;
    const message =
      error instanceof Error ? error.message : 'Unknown processing error';

    if (retryCount >= MAX_RETRIES) {
      await this.prisma.event.update({
        where: { id },
        data: {
          processingStatus: 'DLQ',
          retryCount,
          processingError: message,
        },
      });
      this.logger.warn(`Event ${id} moved to DLQ after ${retryCount} retries`);
      return 'DLQ';
    }

    await this.prisma.event.update({
      where: { id },
      data: {
        processingStatus: 'FAILED',
        retryCount,
        processingError: message,
      },
    });
    return 'FAILED';
  }

  async getMetrics(): Promise<{
    pending: number;
    processing: number;
    processed: number;
    failed: number;
    dlq: number;
    oldestPendingAge: string | null;
    processedLast5min: number;
  }> {
    const [counts, oldestPending, recentProcessed] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ processing_status: string; count: bigint }>
      >`
        SELECT processing_status, COUNT(*)::bigint as count
        FROM events
        WHERE validation_status = 'VALID' OR processing_status = 'REJECTED'
        GROUP BY processing_status
      `,
      this.prisma.event.findFirst({
        where: { processingStatus: 'PENDING', validationStatus: 'VALID' },
        orderBy: { ingestedAt: 'asc' },
        select: { ingestedAt: true },
      }),
      this.prisma.event.count({
        where: {
          processingStatus: 'PROCESSED',
          processedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of counts) {
      statusCounts[row.processing_status] = Number(row.count);
    }

    return {
      pending: statusCounts['PENDING'] ?? 0,
      processing: statusCounts['PROCESSING'] ?? 0,
      processed: statusCounts['PROCESSED'] ?? 0,
      failed: statusCounts['FAILED'] ?? 0,
      dlq: statusCounts['DLQ'] ?? 0,
      oldestPendingAge: oldestPending?.ingestedAt.toISOString() ?? null,
      processedLast5min: recentProcessed,
    };
  }
}
