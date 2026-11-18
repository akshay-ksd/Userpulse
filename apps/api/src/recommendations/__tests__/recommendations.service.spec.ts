import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecommendationsService } from '../recommendations.service.js';

function makePrisma() {
  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    recommendation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    recommendationStatusHistory: {
      create: vi.fn(),
    },
    analysisRun: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let prisma: ReturnType<typeof makePrisma>;

  const orgId = 'org-1';
  const projectId = 'proj-1';
  const userId = 'user-1';

  beforeEach(() => {
    prisma = makePrisma();
    service = new RecommendationsService(prisma as any);
  });

  function setupAccess() {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'mem-1' });
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      organizationId: orgId,
    });
  }

  describe('findByProject', () => {
    it('returns all recommendations when no status filter', async () => {
      setupAccess();
      const recs = [
        { id: 'rec-1', title: 'Test', status: 'PUBLISHED' },
        { id: 'rec-2', title: 'Accepted', status: 'ACCEPTED' },
      ];
      prisma.recommendation.findMany.mockResolvedValue(recs);

      const result = await service.findByProject(orgId, projectId, userId);
      expect(result).toEqual(recs);
      expect(prisma.recommendation.findMany).toHaveBeenCalledWith({
        where: { projectId },
        orderBy: [
          { priorityScore: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      });
    });

    it('filters by status when provided', async () => {
      setupAccess();
      const recs = [{ id: 'rec-1', title: 'Test', status: 'PUBLISHED' }];
      prisma.recommendation.findMany.mockResolvedValue(recs);

      const result = await service.findByProject(
        orgId,
        projectId,
        userId,
        'PUBLISHED',
      );
      expect(result).toEqual(recs);
      expect(prisma.recommendation.findMany).toHaveBeenCalledWith({
        where: { projectId, status: 'PUBLISHED' },
        orderBy: [
          { priorityScore: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      });
    });

    it('ignores invalid status filter', async () => {
      setupAccess();
      prisma.recommendation.findMany.mockResolvedValue([]);

      await service.findByProject(orgId, projectId, userId, 'INVALID');
      expect(prisma.recommendation.findMany).toHaveBeenCalledWith({
        where: { projectId },
        orderBy: [
          { priorityScore: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      });
    });

    it('throws NotFoundException for non-member', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue(null);
      await expect(
        service.findByProject(orgId, projectId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns empty array when no recommendations', async () => {
      setupAccess();
      prisma.recommendation.findMany.mockResolvedValue([]);

      const result = await service.findByProject(orgId, projectId, userId);
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns a recommendation', async () => {
      setupAccess();
      const rec = { id: 'rec-1', title: 'Test', projectId };
      prisma.recommendation.findFirst.mockResolvedValue(rec);

      const result = await service.findOne(orgId, projectId, 'rec-1', userId);
      expect(result).toEqual(rec);
    });

    it('throws NotFoundException when not found', async () => {
      setupAccess();
      prisma.recommendation.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(orgId, projectId, 'rec-missing', userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-member', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue(null);
      await expect(
        service.findOne(orgId, projectId, 'rec-1', userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByAnalysisRun', () => {
    it('returns recommendations for a run', async () => {
      setupAccess();
      prisma.analysisRun.findFirst.mockResolvedValue({
        id: 'run-1',
        projectId,
      });
      const recs = [{ id: 'rec-1', analysisRunId: 'run-1' }];
      prisma.recommendation.findMany.mockResolvedValue(recs);

      const result = await service.findByAnalysisRun(
        orgId,
        projectId,
        'run-1',
        userId,
      );
      expect(result).toEqual(recs);
    });

    it('throws NotFoundException when run not found', async () => {
      setupAccess();
      prisma.analysisRun.findFirst.mockResolvedValue(null);

      await expect(
        service.findByAnalysisRun(orgId, projectId, 'run-missing', userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-member', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue(null);
      await expect(
        service.findByAnalysisRun(orgId, projectId, 'run-1', userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    const recId = 'rec-1';

    it('transitions PUBLISHED to ACCEPTED', async () => {
      setupAccess();
      const rec = { id: recId, projectId, status: 'PUBLISHED' };
      prisma.recommendation.findFirst.mockResolvedValue(rec);
      const updated = { ...rec, status: 'ACCEPTED' };
      prisma.$transaction.mockResolvedValue([updated, {}]);

      const result = await service.updateStatus(
        orgId,
        projectId,
        recId,
        userId,
        'ACCEPTED',
      );
      expect(result).toEqual(updated);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('returns recommendation unchanged when already at target status (idempotent)', async () => {
      setupAccess();
      const rec = { id: recId, projectId, status: 'ACCEPTED' };
      prisma.recommendation.findFirst.mockResolvedValue(rec);

      const result = await service.updateStatus(
        orgId,
        projectId,
        recId,
        userId,
        'ACCEPTED',
      );
      expect(result).toEqual(rec);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid transition', async () => {
      setupAccess();
      const rec = { id: recId, projectId, status: 'REJECTED' };
      prisma.recommendation.findFirst.mockResolvedValue(rec);

      await expect(
        service.updateStatus(orgId, projectId, recId, userId, 'ACCEPTED'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when recommendation not found', async () => {
      setupAccess();
      prisma.recommendation.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(orgId, projectId, recId, userId, 'ACCEPTED'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-member', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus(orgId, projectId, recId, userId, 'ACCEPTED'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
