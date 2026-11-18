import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventProcessorService } from './event-processor.service.js';

function mockPrisma() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    event: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ retryCount: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;
}

describe('EventProcessorService', () => {
  let service: EventProcessorService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new EventProcessorService(prisma);
  });

  it('processes PENDING events and marks them PROCESSED', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'evt-1' },
      { id: 'evt-2' },
    ]);

    await service.processNextBatch();

    expect(prisma.event.update).toHaveBeenCalledTimes(2);
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          processingStatus: 'PROCESSED',
          processedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does nothing when no events are pending', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await service.processNextBatch();

    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('handles processing failure: increments retryCount and sets FAILED', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'evt-1' },
    ]);
    (prisma.event.update as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('DB connection lost'))
      .mockResolvedValue({});
    (prisma.event.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        retryCount: 0,
      },
    );

    await service.processNextBatch();

    expect(prisma.event.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'evt-1' } }),
    );
    const failCall = (prisma.event.update as ReturnType<typeof vi.fn>).mock
      .calls[1];
    expect(failCall[0].data.processingStatus).toBe('FAILED');
    expect(failCall[0].data.retryCount).toBe(1);
    expect(failCall[0].data.processingError).toBe('DB connection lost');
  });

  it('moves event to DLQ after max retries', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'evt-1' },
    ]);
    (prisma.event.update as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Persistent failure'))
      .mockResolvedValue({});
    (prisma.event.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        retryCount: 4,
      },
    );

    await service.processNextBatch();

    const failCall = (prisma.event.update as ReturnType<typeof vi.fn>).mock
      .calls[1];
    expect(failCall[0].data.processingStatus).toBe('DLQ');
    expect(failCall[0].data.retryCount).toBe(5);
  });

  it('prevents concurrent processing via lock', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve([{ id: 'evt-1' }]), 50),
        ),
    );

    const first = service.processNextBatch();
    const second = service.processNextBatch();

    await Promise.all([first, second]);

    // Only one batch should have been claimed
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('handles partial failures: successful events still get processed', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'evt-1' },
      { id: 'evt-2' },
    ]);
    (prisma.event.update as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({}) // evt-1 succeeds
      .mockRejectedValueOnce(new Error('fail')) // evt-2 fails
      .mockResolvedValue({}); // handleFailure update succeeds
    (prisma.event.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        retryCount: 0,
      },
    );

    await service.processNextBatch();

    const calls = (prisma.event.update as ReturnType<typeof vi.fn>).mock.calls;
    // First call: evt-1 PROCESSED
    expect(calls[0][0].data.processingStatus).toBe('PROCESSED');
    // Third call: evt-2 FAILED (second call was the rejected processEvent)
    expect(calls[2][0].data.processingStatus).toBe('FAILED');
  });

  describe('getMetrics', () => {
    it('returns correct aggregate counts', async () => {
      (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { processing_status: 'PENDING', count: BigInt(42) },
        { processing_status: 'PROCESSED', count: BigInt(1500) },
        { processing_status: 'FAILED', count: BigInt(3) },
        { processing_status: 'DLQ', count: BigInt(1) },
      ]);
      (
        prisma.event.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        ingestedAt: new Date('2026-11-15T10:00:00.000Z'),
      });
      (prisma.event.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        250,
      );

      const metrics = await service.getMetrics();

      expect(metrics.pending).toBe(42);
      expect(metrics.processed).toBe(1500);
      expect(metrics.failed).toBe(3);
      expect(metrics.dlq).toBe(1);
      expect(metrics.oldestPendingAge).toBe('2026-11-15T10:00:00.000Z');
      expect(metrics.processedLast5min).toBe(250);
    });

    it('returns null for oldestPendingAge when no pending events', async () => {
      (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (
        prisma.event.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(null);
      (prisma.event.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

      const metrics = await service.getMetrics();

      expect(metrics.pending).toBe(0);
      expect(metrics.oldestPendingAge).toBeNull();
      expect(metrics.processedLast5min).toBe(0);
    });
  });
});
