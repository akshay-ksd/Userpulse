import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { DataDeletionProcessorService } from './data-deletion-processor.service.js';

function mockPrisma() {
  return {
    dataDeletionRequest: {
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    project: {
      update: vi.fn(),
    },
    recommendationStatusHistory: {
      deleteMany: vi.fn().mockResolvedValue({ count: 10 }),
    },
    recommendation: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
    analysisRun: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    analysisSchedule: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    funnelStep: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    funnel: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    featureEventMapping: {
      deleteMany: vi.fn().mockResolvedValue({ count: 7 }),
    },
    feature: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    event: { deleteMany: vi.fn().mockResolvedValue({ count: 100 }) },
    projectApiKey: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  } as unknown as PrismaService;
}

const NOW = new Date('2026-11-18T10:00:00Z');

function makeRequest(overrides = {}) {
  return {
    id: 'req-1',
    projectId: 'proj-1',
    organizationId: 'org-1',
    requestedBy: 'user-1',
    status: 'CONFIRMED',
    scope: {},
    eventsDeleted: 0,
    recordsDeleted: 0,
    error: null,
    confirmedAt: NOW,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('DataDeletionProcessorService', () => {
  let service: DataDeletionProcessorService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new DataDeletionProcessorService(prisma);
  });

  describe('processNextRequest', () => {
    it('processes a CONFIRMED request and deletes data', async () => {
      (
        prisma.dataDeletionRequest.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([makeRequest()]);
      (
        prisma.dataDeletionRequest.update as ReturnType<typeof vi.fn>
      ).mockResolvedValue(makeRequest());
      (prisma.project.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await service.processNextRequest();

      expect(prisma.dataDeletionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'req-1' },
          data: expect.objectContaining({ status: 'PROCESSING' }),
        }),
      );

      expect(prisma.recommendationStatusHistory.deleteMany).toHaveBeenCalled();
      expect(prisma.recommendation.deleteMany).toHaveBeenCalled();
      expect(prisma.analysisRun.deleteMany).toHaveBeenCalled();
      expect(prisma.event.deleteMany).toHaveBeenCalled();
      expect(prisma.projectApiKey.deleteMany).toHaveBeenCalled();

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: { status: 'ARCHIVED' },
      });

      expect(prisma.dataDeletionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('handles errors and sets FAILED status', async () => {
      (
        prisma.dataDeletionRequest.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([makeRequest()]);
      (prisma.dataDeletionRequest.update as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeRequest())
        .mockResolvedValue(makeRequest());
      (
        prisma.recommendationStatusHistory.deleteMany as ReturnType<
          typeof vi.fn
        >
      ).mockRejectedValue(new Error('DB error'));

      await service.processNextRequest();

      expect(prisma.dataDeletionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            error: 'DB error',
          }),
        }),
      );
    });

    it('skips when no CONFIRMED requests', async () => {
      (
        prisma.dataDeletionRequest.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      await service.processNextRequest();

      expect(
        prisma.recommendationStatusHistory.deleteMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('returns metrics', async () => {
      (
        prisma.dataDeletionRequest.count as ReturnType<typeof vi.fn>
      ).mockResolvedValue(2);

      const metrics = await service.getMetrics();

      expect(metrics.pendingRequests).toBe(2);
      expect(metrics.lastRunAt).toBeNull();
    });

    it('returns metrics after a run', async () => {
      (
        prisma.dataDeletionRequest.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);
      await service.processNextRequest();

      (
        prisma.dataDeletionRequest.count as ReturnType<typeof vi.fn>
      ).mockResolvedValue(0);
      const metrics = await service.getMetrics();

      expect(metrics.lastRunAt).not.toBeNull();
      expect(metrics.pendingRequests).toBe(0);
    });
  });
});
