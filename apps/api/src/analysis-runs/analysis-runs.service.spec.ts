import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalysisRunsService } from './analysis-runs.service.js';

function mockPrisma() {
  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    analysisRun: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  } as unknown as PrismaService;
}

const membership = {
  id: 'mem-1',
  organizationId: 'org-1',
  userId: 'user-1',
  role: 'MEMBER',
};

const project = {
  id: 'proj-1',
  organizationId: 'org-1',
  name: 'My App',
  status: 'ACTIVE',
};

const now = new Date();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

function setupAccess(prisma: ReturnType<typeof mockPrisma>) {
  (
    prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
  ).mockResolvedValue(membership);
  (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
    project,
  );
}

describe('AnalysisRunsService', () => {
  describe('requestAnalysis', () => {
    it('creates a QUEUED analysis run', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisRunsService(prisma);
      setupAccess(prisma);

      const created = {
        id: 'run-1',
        projectId: 'proj-1',
        organizationId: 'org-1',
        requestedById: 'user-1',
        status: 'QUEUED',
        periodStart: thirtyDaysAgo,
        periodEnd: now,
        eventCount: null,
        statusMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: now,
      };

      (
        prisma.analysisRun.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (prisma.analysisRun.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        created,
      );

      const result = await service.requestAnalysis(
        'org-1',
        'proj-1',
        'user-1',
        {
          periodStart: thirtyDaysAgo,
          periodEnd: now,
        },
      );

      expect(result.status).toBe('QUEUED');
      expect(prisma.analysisRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: 'proj-1',
          organizationId: 'org-1',
          requestedById: 'user-1',
          status: 'QUEUED',
        }),
      });
    });

    it('throws ConflictException when a run is already active', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisRunsService(prisma);
      setupAccess(prisma);

      (
        prisma.analysisRun.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ id: 'run-active', status: 'RUNNING' });

      await expect(
        service.requestAnalysis('org-1', 'proj-1', 'user-1', {
          periodStart: thirtyDaysAgo,
          periodEnd: now,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisRunsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.requestAnalysis('org-1', 'proj-1', 'user-1', {
          periodStart: thirtyDaysAgo,
          periodEnd: now,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByProject', () => {
    it('returns runs ordered by createdAt DESC', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisRunsService(prisma);
      setupAccess(prisma);

      const runs = [
        { id: 'run-2', status: 'COMPLETED', createdAt: now },
        { id: 'run-1', status: 'FAILED', createdAt: thirtyDaysAgo },
      ];
      (
        prisma.analysisRun.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue(runs);

      const result = await service.findByProject('org-1', 'proj-1', 'user-1');
      expect(result).toHaveLength(2);
      expect(prisma.analysisRun.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns empty list when no runs exist', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisRunsService(prisma);
      setupAccess(prisma);

      (
        prisma.analysisRun.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const result = await service.findByProject('org-1', 'proj-1', 'user-1');
      expect(result).toHaveLength(0);
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisRunsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.findByProject('org-1', 'proj-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('returns the run when found', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisRunsService(prisma);
      setupAccess(prisma);

      const run = { id: 'run-1', projectId: 'proj-1', status: 'COMPLETED' };
      (
        prisma.analysisRun.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(run);

      const result = await service.findOne(
        'org-1',
        'proj-1',
        'run-1',
        'user-1',
      );
      expect(result.id).toBe('run-1');
    });

    it('throws NotFoundException when run not found', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisRunsService(prisma);
      setupAccess(prisma);

      (
        prisma.analysisRun.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.findOne('org-1', 'proj-1', 'run-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisRunsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.findOne('org-1', 'proj-1', 'run-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
