import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScheduledAnalysisRunnerService } from './scheduled-analysis-runner.service.js';

function mockPrisma() {
  return {
    analysisSchedule: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    analysisRun: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
    },
  } as unknown as PrismaService;
}

const pastDate = new Date(Date.now() - 60_000);

const dueSchedule = {
  id: 'sched-1',
  projectId: 'proj-1',
  organizationId: 'org-1',
  intervalHours: 24,
  enabled: true,
  lastRunAt: null,
  nextRunAt: pastDate,
  createdBy: 'user-1',
  updatedBy: 'user-1',
};

describe('ScheduledAnalysisRunnerService', () => {
  let service: ScheduledAnalysisRunnerService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new ScheduledAnalysisRunnerService(
      prisma as unknown as PrismaService,
    );
  });

  it('queues an analysis run for a due schedule', async () => {
    (
      prisma.analysisSchedule.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([dueSchedule]);

    await service.checkDueSchedules();

    expect(prisma.analysisRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'proj-1',
        organizationId: 'org-1',
        requestedById: 'user-1',
        status: 'QUEUED',
      }),
    });

    expect(prisma.analysisSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sched-1' },
        data: expect.objectContaining({
          lastRunAt: expect.any(Date),
          nextRunAt: expect.any(Date),
        }),
      }),
    );
  });

  it('skips when an active run already exists', async () => {
    (
      prisma.analysisSchedule.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([dueSchedule]);
    (
      prisma.analysisRun.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: 'active-run', status: 'RUNNING' });

    await service.checkDueSchedules();

    expect(prisma.analysisRun.create).not.toHaveBeenCalled();
    expect(prisma.analysisSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sched-1' },
        data: expect.objectContaining({
          nextRunAt: expect.any(Date),
        }),
      }),
    );
  });

  it('advances nextRunAt by intervalHours', async () => {
    (
      prisma.analysisSchedule.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([dueSchedule]);

    await service.checkDueSchedules();

    const updateCall = (
      prisma.analysisSchedule.update as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    const nextRunAt: Date = updateCall.data.nextRunAt;
    const expectedMin = Date.now() + 23 * 60 * 60 * 1000;
    const expectedMax = Date.now() + 25 * 60 * 60 * 1000;
    expect(nextRunAt.getTime()).toBeGreaterThan(expectedMin);
    expect(nextRunAt.getTime()).toBeLessThan(expectedMax);
  });

  it('does nothing when no schedules are due', async () => {
    (
      prisma.analysisSchedule.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    await service.checkDueSchedules();

    expect(prisma.analysisRun.create).not.toHaveBeenCalled();
  });

  it('continues processing other schedules if one fails', async () => {
    const secondSchedule = {
      ...dueSchedule,
      id: 'sched-2',
      projectId: 'proj-2',
    };
    (
      prisma.analysisSchedule.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([dueSchedule, secondSchedule]);

    (prisma.analysisRun.findFirst as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(null);

    await service.checkDueSchedules();

    expect(prisma.analysisRun.create).toHaveBeenCalledOnce();
    expect(prisma.analysisRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: 'proj-2' }),
    });
  });
});
