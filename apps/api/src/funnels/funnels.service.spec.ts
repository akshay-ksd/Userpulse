import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { FunnelsService } from './funnels.service.js';

function mockPrisma() {
  const txFunnel = {
    create: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  };
  const txFunnelStep = {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  };

  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    funnel: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    event: {
      groupBy: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        funnel: txFunnel,
        funnelStep: txFunnelStep,
      }),
    ),
    _txFunnel: txFunnel,
    _txFunnelStep: txFunnelStep,
  } as unknown as PrismaService & {
    _txFunnel: typeof txFunnel;
    _txFunnelStep: typeof txFunnelStep;
  };
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

const funnelWithSteps = {
  id: 'fun-1',
  projectId: 'proj-1',
  name: 'Onboarding',
  createdAt: now,
  updatedAt: now,
  steps: [
    { id: 's1', stepOrder: 0, eventName: 'sign_up' },
    { id: 's2', stepOrder: 1, eventName: 'complete_profile' },
  ],
};

function setupAccess(prisma: ReturnType<typeof mockPrisma>) {
  (
    prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
  ).mockResolvedValue(membership);
  (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
    project,
  );
}

describe('FunnelsService', () => {
  describe('create', () => {
    it('creates a funnel with ordered steps', async () => {
      const prisma = mockPrisma();
      setupAccess(prisma);
      prisma._txFunnel.create.mockResolvedValue({
        id: 'fun-1',
        projectId: 'proj-1',
        name: 'Onboarding',
        createdAt: now,
        updatedAt: now,
      });
      prisma._txFunnelStep.createMany.mockResolvedValue({ count: 2 });
      prisma._txFunnel.findUniqueOrThrow.mockResolvedValue(funnelWithSteps);

      const service = new FunnelsService(prisma);
      const result = await service.create('org-1', 'proj-1', 'user-1', {
        name: 'Onboarding',
        steps: [{ eventName: 'sign_up' }, { eventName: 'complete_profile' }],
      });

      expect(result.name).toBe('Onboarding');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].eventName).toBe('sign_up');
      expect(result.steps[1].eventName).toBe('complete_profile');
      expect(prisma._txFunnelStep.createMany).toHaveBeenCalledWith({
        data: [
          { funnelId: 'fun-1', stepOrder: 0, eventName: 'sign_up' },
          { funnelId: 'fun-1', stepOrder: 1, eventName: 'complete_profile' },
        ],
      });
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const service = new FunnelsService(prisma);
      await expect(
        service.create('org-1', 'proj-1', 'user-1', {
          name: 'Funnel',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for missing project', async () => {
      const prisma = mockPrisma();
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      const service = new FunnelsService(prisma);
      await expect(
        service.create('org-1', 'proj-1', 'user-1', {
          name: 'Funnel',
          steps: [{ eventName: 'a' }, { eventName: 'b' }],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByProject', () => {
    it('returns funnels with step counts', async () => {
      const prisma = mockPrisma();
      setupAccess(prisma);
      (prisma.funnel.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'fun-1',
          projectId: 'proj-1',
          name: 'Onboarding',
          createdAt: now,
          updatedAt: now,
          _count: { steps: 3 },
        },
      ]);

      const service = new FunnelsService(prisma);
      const result = await service.findByProject('org-1', 'proj-1', 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Onboarding');
      expect(result[0].stepCount).toBe(3);
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const service = new FunnelsService(prisma);
      await expect(
        service.findByProject('org-1', 'proj-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('returns funnel with steps', async () => {
      const prisma = mockPrisma();
      setupAccess(prisma);
      (prisma.funnel.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        funnelWithSteps,
      );

      const service = new FunnelsService(prisma);
      const result = await service.findOne(
        'org-1',
        'proj-1',
        'user-1',
        'fun-1',
      );

      expect(result.id).toBe('fun-1');
      expect(result.steps).toHaveLength(2);
    });

    it('throws NotFoundException for missing funnel', async () => {
      const prisma = mockPrisma();
      setupAccess(prisma);
      (prisma.funnel.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      const service = new FunnelsService(prisma);
      await expect(
        service.findOne('org-1', 'proj-1', 'user-1', 'fun-999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates name only', async () => {
      const prisma = mockPrisma();
      setupAccess(prisma);
      (prisma.funnel.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        funnelWithSteps,
      );
      prisma._txFunnel.findUniqueOrThrow.mockResolvedValue({
        ...funnelWithSteps,
        name: 'Renamed',
      });

      const service = new FunnelsService(prisma);
      const result = await service.update(
        'org-1',
        'proj-1',
        'user-1',
        'fun-1',
        { name: 'Renamed' },
      );

      expect(result.name).toBe('Renamed');
      expect(prisma._txFunnel.update).toHaveBeenCalledWith({
        where: { id: 'fun-1' },
        data: { name: 'Renamed' },
      });
      expect(prisma._txFunnelStep.deleteMany).not.toHaveBeenCalled();
    });

    it('replaces steps', async () => {
      const prisma = mockPrisma();
      setupAccess(prisma);
      (prisma.funnel.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        funnelWithSteps,
      );
      const newSteps = [
        { id: 's3', stepOrder: 0, eventName: 'login' },
        { id: 's4', stepOrder: 1, eventName: 'purchase' },
        { id: 's5', stepOrder: 2, eventName: 'review' },
      ];
      prisma._txFunnel.findUniqueOrThrow.mockResolvedValue({
        ...funnelWithSteps,
        steps: newSteps,
      });
      prisma._txFunnelStep.deleteMany.mockResolvedValue({ count: 2 });
      prisma._txFunnelStep.createMany.mockResolvedValue({ count: 3 });

      const service = new FunnelsService(prisma);
      const result = await service.update(
        'org-1',
        'proj-1',
        'user-1',
        'fun-1',
        {
          steps: [
            { eventName: 'login' },
            { eventName: 'purchase' },
            { eventName: 'review' },
          ],
        },
      );

      expect(result.steps).toHaveLength(3);
      expect(prisma._txFunnelStep.deleteMany).toHaveBeenCalledWith({
        where: { funnelId: 'fun-1' },
      });
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const service = new FunnelsService(prisma);
      await expect(
        service.update('org-1', 'proj-1', 'user-1', 'fun-1', {
          name: 'x',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for missing funnel', async () => {
      const prisma = mockPrisma();
      setupAccess(prisma);
      (prisma.funnel.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      const service = new FunnelsService(prisma);
      await expect(
        service.update('org-1', 'proj-1', 'user-1', 'fun-999', {
          name: 'x',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a funnel', async () => {
      const prisma = mockPrisma();
      setupAccess(prisma);
      (prisma.funnel.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        funnelWithSteps,
      );
      (prisma.funnel.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
        funnelWithSteps,
      );

      const service = new FunnelsService(prisma);
      await service.remove('org-1', 'proj-1', 'user-1', 'fun-1');

      expect(prisma.funnel.delete).toHaveBeenCalledWith({
        where: { id: 'fun-1' },
      });
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const service = new FunnelsService(prisma);
      await expect(
        service.remove('org-1', 'proj-1', 'user-1', 'fun-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProjectEventNames', () => {
    it('returns sorted distinct event names', async () => {
      const prisma = mockPrisma();
      setupAccess(prisma);
      (prisma.event.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
        { eventName: 'sign_up' },
        { eventName: 'click_button' },
        { eventName: 'page_view' },
      ]);

      const service = new FunnelsService(prisma);
      const result = await service.getProjectEventNames(
        'org-1',
        'proj-1',
        'user-1',
      );

      expect(result).toEqual(['click_button', 'page_view', 'sign_up']);
    });
  });
});
