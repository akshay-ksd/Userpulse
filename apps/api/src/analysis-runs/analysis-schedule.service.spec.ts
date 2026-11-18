import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalysisScheduleService } from './analysis-schedule.service.js';

function mockPrisma() {
  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    analysisSchedule: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaService;
}

function setupAccess(prisma: ReturnType<typeof mockPrisma>) {
  (
    prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
  ).mockResolvedValue({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
  });
  (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'proj-1',
    organizationId: 'org-1',
  });
}

describe('AnalysisScheduleService', () => {
  describe('upsert', () => {
    it('creates a schedule with correct nextRunAt', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisScheduleService(prisma);
      setupAccess(prisma);

      const schedule = {
        id: 'sched-1',
        projectId: 'proj-1',
        organizationId: 'org-1',
        intervalHours: 24,
        enabled: true,
        lastRunAt: null,
        nextRunAt: new Date(),
        createdBy: 'user-1',
        updatedBy: 'user-1',
        createdAt: new Date(),
      };

      (
        prisma.analysisSchedule.upsert as ReturnType<typeof vi.fn>
      ).mockResolvedValue(schedule);

      const result = await service.upsert('org-1', 'proj-1', 'user-1', {
        intervalHours: 24,
        enabled: true,
      });

      expect(result.projectId).toBe('proj-1');
      expect(prisma.analysisSchedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: 'proj-1' },
          create: expect.objectContaining({
            projectId: 'proj-1',
            organizationId: 'org-1',
            intervalHours: 24,
            enabled: true,
            createdBy: 'user-1',
          }),
        }),
      );
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisScheduleService(prisma);
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.upsert('org-1', 'proj-1', 'user-1', {
          intervalHours: 24,
          enabled: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByProject', () => {
    it('returns the schedule when found', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisScheduleService(prisma);
      setupAccess(prisma);

      const schedule = { id: 'sched-1', projectId: 'proj-1', enabled: true };
      (
        prisma.analysisSchedule.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(schedule);

      const result = await service.findByProject('org-1', 'proj-1', 'user-1');
      expect(result).toEqual(schedule);
    });

    it('returns null when no schedule exists', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisScheduleService(prisma);
      setupAccess(prisma);

      (
        prisma.analysisSchedule.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const result = await service.findByProject('org-1', 'proj-1', 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('disable', () => {
    it('sets enabled to false', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisScheduleService(prisma);
      setupAccess(prisma);

      const schedule = { id: 'sched-1', projectId: 'proj-1', enabled: true };
      (
        prisma.analysisSchedule.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(schedule);
      (
        prisma.analysisSchedule.update as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ ...schedule, enabled: false });

      const result = await service.disable('org-1', 'proj-1', 'user-1');
      expect(result.enabled).toBe(false);
      expect(prisma.analysisSchedule.update).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        data: { enabled: false, updatedBy: 'user-1' },
      });
    });

    it('throws NotFoundException when no schedule exists', async () => {
      const prisma = mockPrisma();
      const service = new AnalysisScheduleService(prisma);
      setupAccess(prisma);

      (
        prisma.analysisSchedule.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.disable('org-1', 'proj-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
