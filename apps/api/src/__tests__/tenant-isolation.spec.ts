import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ProjectsService } from '../projects/projects.service.js';
import { RecommendationsService } from '../recommendations/recommendations.service.js';
import { FunnelsService } from '../funnels/funnels.service.js';
import { FeaturesService } from '../features/features.service.js';
import { ApiKeysService } from '../api-keys/api-keys.service.js';
import { AnalysisRunsService } from '../analysis-runs/analysis-runs.service.js';
import { AnalysisScheduleService } from '../analysis-runs/analysis-schedule.service.js';
import { EventProcessorController } from '../event-processor/event-processor.controller.js';
import { EventProcessorService } from '../event-processor/event-processor.service.js';

function makePrisma() {
  return {
    organizationMember: { findUnique: vi.fn() },
    project: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    recommendation: { findMany: vi.fn(), findFirst: vi.fn() },
    recommendationStatusHistory: { create: vi.fn() },
    analysisRun: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    analysisSchedule: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    funnel: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    feature: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    featureEventMapping: { findMany: vi.fn() },
    projectApiKey: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    event: { count: vi.fn(), aggregate: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
}

const orgA = 'org-a';
const orgB = 'org-b';
const projectA = 'proj-a';
const projectB = 'proj-b';
const userA = 'user-a';
const userB = 'user-b';

describe('Cross-tenant isolation', () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.restoreAllMocks();
  });

  function setupUserAOnly() {
    prisma.organizationMember.findUnique.mockImplementation(
      async ({ where }: any) => {
        if (
          where.organizationId_userId.organizationId === orgA &&
          where.organizationId_userId.userId === userA
        ) {
          return { id: 'mem-a', role: 'OWNER' };
        }
        return null;
      },
    );
    prisma.project.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.id === projectA && where.organizationId === orgA) {
        return { id: projectA, organizationId: orgA };
      }
      return null;
    });
  }

  describe('ProjectsService — non-member cannot access another org', () => {
    it('rejects project listing for non-member', async () => {
      const service = new ProjectsService(prisma as any);
      setupUserAOnly();

      await expect(service.findByOrganization(orgA, userB)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects project detail for non-member', async () => {
      const service = new ProjectsService(prisma as any);
      setupUserAOnly();

      await expect(service.findOne(orgA, projectA, userB)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects project creation for non-member', async () => {
      const service = new ProjectsService(prisma as any);
      setupUserAOnly();

      await expect(
        service.create(orgA, userB, { name: 'Stolen project' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('RecommendationsService — cross-tenant access blocked', () => {
    it('rejects recommendation listing for non-member', async () => {
      const service = new RecommendationsService(prisma as any);
      setupUserAOnly();

      await expect(
        service.findByProject(orgA, projectA, userB),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects recommendation status update for non-member', async () => {
      const service = new RecommendationsService(prisma as any);
      setupUserAOnly();

      await expect(
        service.updateStatus(orgA, projectA, 'rec-1', userB, 'ACCEPTED'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects recommendation detail for non-member', async () => {
      const service = new RecommendationsService(prisma as any);
      setupUserAOnly();

      await expect(
        service.findOne(orgA, projectA, 'rec-1', userB),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('FunnelsService — cross-tenant access blocked', () => {
    it('rejects funnel listing for non-member', async () => {
      const service = new FunnelsService(prisma as any);
      setupUserAOnly();

      await expect(
        service.findByProject(orgA, projectA, userB),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects funnel creation for non-member', async () => {
      const service = new FunnelsService(prisma as any);
      setupUserAOnly();

      await expect(
        service.create(orgA, projectA, userB, {
          name: 'Stolen funnel',
          steps: [{ eventName: 'click' }, { eventName: 'submit' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('FeaturesService — cross-tenant access blocked', () => {
    it('rejects feature listing for non-member', async () => {
      const service = new FeaturesService(prisma as any);
      setupUserAOnly();

      await expect(
        service.findByProject(orgA, projectA, userB),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects feature creation for non-member', async () => {
      const service = new FeaturesService(prisma as any);
      setupUserAOnly();

      await expect(
        service.create(orgA, projectA, userB, { name: 'Stolen feature' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('ApiKeysService — cross-tenant access blocked', () => {
    it('rejects API key listing for non-member', async () => {
      const service = new ApiKeysService(prisma as any);
      setupUserAOnly();

      await expect(
        service.findByProject(orgA, projectA, userB),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects API key creation for non-member', async () => {
      const service = new ApiKeysService(prisma as any);
      setupUserAOnly();

      await expect(
        service.create(orgA, projectA, userB, { name: 'Stolen key' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('AnalysisRunsService — cross-tenant access blocked', () => {
    it('rejects analysis run listing for non-member', async () => {
      const service = new AnalysisRunsService(prisma as any);
      setupUserAOnly();

      await expect(
        service.findByProject(orgA, projectA, userB),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('AnalysisScheduleService — cross-tenant access blocked', () => {
    it('rejects schedule read for non-member', async () => {
      const service = new AnalysisScheduleService(prisma as any);
      setupUserAOnly();

      await expect(
        service.findByProject(orgA, projectA, userB),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('EventProcessorController — internal metrics require token', () => {
    it('rejects request without internal token', async () => {
      const processorService = { getMetrics: vi.fn() } as any;
      const controller = new EventProcessorController(processorService);

      process.env.INTERNAL_METRICS_TOKEN = 'secret-token';
      await expect(controller.getProcessingMetrics()).rejects.toThrow(
        ForbiddenException,
      );
      delete process.env.INTERNAL_METRICS_TOKEN;
    });

    it('rejects request with wrong token', async () => {
      const processorService = { getMetrics: vi.fn() } as any;
      const controller = new EventProcessorController(processorService);

      process.env.INTERNAL_METRICS_TOKEN = 'secret-token';
      await expect(
        controller.getProcessingMetrics('wrong-token'),
      ).rejects.toThrow(ForbiddenException);
      delete process.env.INTERNAL_METRICS_TOKEN;
    });

    it('allows request with correct token', async () => {
      const metrics = { pending: 0, processed: 10 };
      const processorService = {
        getMetrics: vi.fn().mockResolvedValue(metrics),
      } as any;
      const controller = new EventProcessorController(processorService);

      process.env.INTERNAL_METRICS_TOKEN = 'secret-token';
      const result = await controller.getProcessingMetrics('secret-token');
      expect(result).toEqual(metrics);
      delete process.env.INTERNAL_METRICS_TOKEN;
    });

    it('rejects when no token is configured', async () => {
      const processorService = { getMetrics: vi.fn() } as any;
      const controller = new EventProcessorController(processorService);

      delete process.env.INTERNAL_METRICS_TOKEN;
      await expect(
        controller.getProcessingMetrics('any-token'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Cross-org project access via URL manipulation', () => {
    it('rejects when userA tries to access orgB project via orgA URL', async () => {
      const service = new ProjectsService(prisma as any);
      prisma.organizationMember.findUnique.mockImplementation(
        async ({ where }: any) => {
          if (
            where.organizationId_userId.organizationId === orgA &&
            where.organizationId_userId.userId === userA
          ) {
            return { id: 'mem-a', role: 'OWNER' };
          }
          return null;
        },
      );
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.findOne(orgA, projectB, userA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects when userB guesses orgA project ID in orgB URL', async () => {
      const service = new ProjectsService(prisma as any);
      prisma.organizationMember.findUnique.mockImplementation(
        async ({ where }: any) => {
          if (
            where.organizationId_userId.organizationId === orgB &&
            where.organizationId_userId.userId === userB
          ) {
            return { id: 'mem-b', role: 'OWNER' };
          }
          return null;
        },
      );
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.findOne(orgB, projectA, userB)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Consistent 404 (not 403) for unauthorized access', () => {
    it('ProjectsService returns 404 for non-member (does not reveal existence)', async () => {
      const service = new ProjectsService(prisma as any);
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      try {
        await service.findByOrganization(orgA, userB);
        expect.unreachable('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.status).toBe(404);
      }
    });

    it('RecommendationsService returns 404 for non-member (does not reveal existence)', async () => {
      const service = new RecommendationsService(prisma as any);
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      try {
        await service.findByProject(orgA, projectA, userB);
        expect.unreachable('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        expect(e.status).toBe(404);
      }
    });
  });
});
