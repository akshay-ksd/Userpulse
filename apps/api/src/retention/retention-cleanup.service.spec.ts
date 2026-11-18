import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { RetentionCleanupService } from './retention-cleanup.service.js';

function mockPrisma() {
  return {
    dataRetentionSetting: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    event: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaService;
}

describe('RetentionCleanupService', () => {
  let service: RetentionCleanupService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new RetentionCleanupService(prisma);
  });

  it('deletes expired events for orgs with retention settings', async () => {
    (
      prisma.dataRetentionSetting.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ organizationId: 'org-1', eventRetentionDays: 90 }]);
    (prisma.event.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 42,
    });

    await service.runCleanup();

    expect(prisma.event.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        ingestedAt: { lt: expect.any(Date) },
        processingStatus: {
          in: ['PROCESSED', 'FAILED', 'DLQ', 'REJECTED'],
        },
      },
    });

    const metrics = service.getMetrics();
    expect(metrics.eventsDeletedLastRun).toBe(42);
    expect(metrics.errorsLastRun).toBe(0);
    expect(metrics.orgsProcessedLastRun).toBe(1);
    expect(metrics.lastRunAt).not.toBeNull();
  });

  it('does nothing when no retention settings exist', async () => {
    (
      prisma.dataRetentionSetting.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    await service.runCleanup();

    expect(prisma.event.deleteMany).not.toHaveBeenCalled();

    const metrics = service.getMetrics();
    expect(metrics.eventsDeletedLastRun).toBe(0);
    expect(metrics.orgsProcessedLastRun).toBe(0);
  });

  it('handles errors gracefully for individual orgs', async () => {
    (
      prisma.dataRetentionSetting.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { organizationId: 'org-1', eventRetentionDays: 90 },
      { organizationId: 'org-2', eventRetentionDays: 60 },
    ]);
    (prisma.event.deleteMany as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({ count: 10 });

    await service.runCleanup();

    const metrics = service.getMetrics();
    expect(metrics.errorsLastRun).toBe(1);
    expect(metrics.orgsProcessedLastRun).toBe(1);
    expect(metrics.eventsDeletedLastRun).toBe(10);
  });

  it('returns default metrics before first run', () => {
    const metrics = service.getMetrics();
    expect(metrics.lastRunAt).toBeNull();
    expect(metrics.eventsDeletedLastRun).toBe(0);
    expect(metrics.errorsLastRun).toBe(0);
    expect(metrics.orgsProcessedLastRun).toBe(0);
  });

  it('does not run concurrently', async () => {
    (
      prisma.dataRetentionSetting.findMany as ReturnType<typeof vi.fn>
    ).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve([{ organizationId: 'org-1', eventRetentionDays: 90 }]),
            50,
          ),
        ),
    );
    (prisma.event.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });

    const first = service.runCleanup();
    const second = service.runCleanup();

    await Promise.all([first, second]);

    expect(prisma.dataRetentionSetting.findMany).toHaveBeenCalledTimes(1);
  });
});
