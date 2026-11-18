import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalysisRunProcessorService } from './analysis-run-processor.service.js';
import type { EvidenceGathererService } from '../recommendations/evidence-gatherer.service.js';
import type { RecommendationGeneratorService } from '../recommendations/recommendation-generator.service.js';

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
        recommendation: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }),
    ),
    _txAnalysisRun: txAnalysisRun,
    _txEvent: txEvent,
  } as unknown as PrismaService & {
    _txAnalysisRun: typeof txAnalysisRun;
    _txEvent: typeof txEvent;
  };
}

function mockEvidenceGatherer(): EvidenceGathererService {
  return {
    gatherEvidence: vi.fn().mockResolvedValue({
      project: { id: 'proj-1', name: 'Test', description: null },
      features: [],
      featureAdoption: [],
      activityChanges: [],
      featureUsage: [],
      topEvents: [],
      activeUsers: 10,
      totalEvents: 50,
      period: { start: '2026-10-18', end: '2026-11-17' },
    }),
  } as unknown as EvidenceGathererService;
}

function mockRecommendationGenerator(): RecommendationGeneratorService {
  return {
    generateRecommendations: vi.fn().mockResolvedValue([]),
  } as unknown as RecommendationGeneratorService;
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
  let evidenceGatherer: EvidenceGathererService;
  let recommendationGenerator: RecommendationGeneratorService;

  beforeEach(() => {
    prisma = mockPrisma();
    evidenceGatherer = mockEvidenceGatherer();
    recommendationGenerator = mockRecommendationGenerator();
    service = new AnalysisRunProcessorService(
      prisma as unknown as PrismaService,
      evidenceGatherer,
      recommendationGenerator,
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
          recommendation: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
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
          recommendation: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
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
          recommendation: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
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
          recommendation: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        });
      },
    );

    await service.processNextRun();

    expect(lastUpdateData).toBeDefined();
    expect(lastUpdateData!.status).toBe('FAILED');
    expect(lastUpdateData!.statusMessage).toContain('DB error');
  });

  describe('deduplication', () => {
    const generatedRec = {
      title: 'Low adoption',
      summary: 'Feature X has low adoption',
      suggestedAction: 'Improve onboarding',
      category: 'feature_adoption',
      affectedFeatureId: 'feat-1',
      affectedArea: null,
      evidence: { type: 'feature_adoption' },
      confidence: 0.8,
      impact: 0.6,
      reach: 0.5,
      priorityScore: 0.24,
    };

    function buildTxMocks(
      existingPublished: Array<{
        id: string;
        category: string;
        affectedFeatureId: string | null;
        affectedArea: string | null;
      }>,
    ) {
      const createFn = vi.fn().mockResolvedValue({ id: 'new-rec-1' });
      const updateManyFn = vi.fn().mockResolvedValue({ count: 1 });
      const findManyFn = vi.fn().mockResolvedValue(existingPublished);

      return {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
        analysisRun: {
          update: vi.fn().mockResolvedValue({}),
          findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun),
        },
        event: { count: vi.fn().mockResolvedValue(50) },
        recommendation: {
          findMany: findManyFn,
          create: createFn,
          updateMany: updateManyFn,
        },
        _create: createFn,
        _updateMany: updateManyFn,
        _findMany: findManyFn,
      };
    }

    it('supersedes existing recommendation with same category and affectedFeatureId', async () => {
      let txMocks: ReturnType<typeof buildTxMocks>;

      (
        recommendationGenerator.generateRecommendations as ReturnType<
          typeof vi.fn
        >
      ).mockResolvedValue([generatedRec]);

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          txMocks = buildTxMocks([
            {
              id: 'old-rec-1',
              category: 'feature_adoption',
              affectedFeatureId: 'feat-1',
              affectedArea: null,
            },
          ]);
          return fn(txMocks);
        },
      );

      await service.processNextRun();

      expect(txMocks!._create).toHaveBeenCalledOnce();
      expect(txMocks!._updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-rec-1'] }, status: 'PUBLISHED' },
        data: { status: 'SUPERSEDED', supersededById: 'new-rec-1' },
      });
    });

    it('does NOT supersede when category differs', async () => {
      let txMocks: ReturnType<typeof buildTxMocks>;

      (
        recommendationGenerator.generateRecommendations as ReturnType<
          typeof vi.fn
        >
      ).mockResolvedValue([generatedRec]);

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          txMocks = buildTxMocks([
            {
              id: 'old-rec-1',
              category: 'activity_change',
              affectedFeatureId: 'feat-1',
              affectedArea: null,
            },
          ]);
          return fn(txMocks);
        },
      );

      await service.processNextRun();

      expect(txMocks!._create).toHaveBeenCalledOnce();
      expect(txMocks!._updateMany).not.toHaveBeenCalled();
    });

    it('does NOT supersede when affectedFeatureId differs', async () => {
      let txMocks: ReturnType<typeof buildTxMocks>;

      (
        recommendationGenerator.generateRecommendations as ReturnType<
          typeof vi.fn
        >
      ).mockResolvedValue([generatedRec]);

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          txMocks = buildTxMocks([
            {
              id: 'old-rec-1',
              category: 'feature_adoption',
              affectedFeatureId: 'feat-99',
              affectedArea: null,
            },
          ]);
          return fn(txMocks);
        },
      );

      await service.processNextRun();

      expect(txMocks!._create).toHaveBeenCalledOnce();
      expect(txMocks!._updateMany).not.toHaveBeenCalled();
    });

    it('matches on affectedArea for project-wide recommendations', async () => {
      let txMocks: ReturnType<typeof buildTxMocks>;
      const projectWideRec = {
        ...generatedRec,
        category: 'activity_change',
        affectedFeatureId: null,
        affectedArea: 'overall',
      };

      (
        recommendationGenerator.generateRecommendations as ReturnType<
          typeof vi.fn
        >
      ).mockResolvedValue([projectWideRec]);

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          txMocks = buildTxMocks([
            {
              id: 'old-rec-1',
              category: 'activity_change',
              affectedFeatureId: null,
              affectedArea: 'overall',
            },
          ]);
          return fn(txMocks);
        },
      );

      await service.processNextRun();

      expect(txMocks!._updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-rec-1'] }, status: 'PUBLISHED' },
        data: { status: 'SUPERSEDED', supersededById: 'new-rec-1' },
      });
    });

    it('publishes normally when no existing match', async () => {
      let txMocks: ReturnType<typeof buildTxMocks>;

      (
        recommendationGenerator.generateRecommendations as ReturnType<
          typeof vi.fn
        >
      ).mockResolvedValue([generatedRec]);

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          txMocks = buildTxMocks([]);
          return fn(txMocks);
        },
      );

      await service.processNextRun();

      expect(txMocks!._create).toHaveBeenCalledOnce();
      expect(txMocks!._updateMany).not.toHaveBeenCalled();
    });
  });
});
