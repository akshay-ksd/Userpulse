import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalysisRunProcessorService } from './analysis-run-processor.service.js';

function mockPrisma() {
  const txAnalysisRun = {
    update: vi.fn().mockResolvedValue({}),
    findUniqueOrThrow: vi.fn(),
  };
  const txEvent = {
    count: vi.fn(),
  };

  return {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn().mockResolvedValue([]),
        analysisRun: txAnalysisRun,
        event: txEvent,
      }),
    ),
    _txAnalysisRun: txAnalysisRun,
    _txEvent: txEvent,
  } as unknown as PrismaService & {
    _txAnalysisRun: typeof txAnalysisRun;
    _txEvent: typeof txEvent;
  };
}

const now = new Date();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

const queuedRun = {
  id: 'run-1',
  projectId: 'proj-1',
  organizationId: 'org-1',
  status: 'QUEUED',
  periodStart: thirtyDaysAgo,
  periodEnd: now,
};

describe('AnalysisRunProcessorService', () => {
  let service: AnalysisRunProcessorService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new AnalysisRunProcessorService(
      prisma as unknown as PrismaService,
    );
  });

  it('processes a QUEUED run and marks it COMPLETED with event count', async () => {
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
          analysisRun: {
            update: vi.fn().mockResolvedValue({}),
            findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun),
          },
          event: {
            count: vi.fn().mockResolvedValue(50),
          },
        });
      },
    );

    await service.processNextRun();

    const txCall = (prisma.$transaction as ReturnType<typeof vi.fn>).mock
      .results[0].value;
    await expect(txCall).resolves.toBeUndefined();
  });

  it('marks run as INSUFFICIENT_DATA when event count is below threshold', async () => {
    let lastUpdateData: Record<string, unknown> | undefined;

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const updateFn = vi.fn().mockImplementation((args) => {
          lastUpdateData = args.data;
          return {};
        });
        return fn({
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
          analysisRun: {
            update: updateFn,
            findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun),
          },
          event: {
            count: vi.fn().mockResolvedValue(3),
          },
        });
      },
    );

    await service.processNextRun();

    expect(lastUpdateData).toBeDefined();
    expect(lastUpdateData!.status).toBe('INSUFFICIENT_DATA');
    expect(lastUpdateData!.eventCount).toBe(3);
    expect(lastUpdateData!.statusMessage).toContain('Insufficient data');
  });

  it('does nothing when no QUEUED runs exist', async () => {
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          $queryRaw: vi.fn().mockResolvedValue([]),
          analysisRun: { update: vi.fn(), findUniqueOrThrow: vi.fn() },
          event: { count: vi.fn() },
        });
      },
    );

    await service.processNextRun();
    // No error thrown, nothing updated
  });

  it('marks run as FAILED on error', async () => {
    let lastUpdateData: Record<string, unknown> | undefined;

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const updateFn = vi.fn().mockImplementation((args) => {
          lastUpdateData = args.data;
          return {};
        });
        return fn({
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
          analysisRun: {
            update: updateFn,
            findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun),
          },
          event: {
            count: vi.fn().mockRejectedValue(new Error('DB error')),
          },
        });
      },
    );

    await service.processNextRun();

    expect(lastUpdateData).toBeDefined();
    expect(lastUpdateData!.status).toBe('FAILED');
    expect(lastUpdateData!.statusMessage).toContain('DB error');
  });
});
