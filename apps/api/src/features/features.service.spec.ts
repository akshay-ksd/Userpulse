import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeaturesService } from './features.service.js';

function mockPrisma() {
  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    feature: {
      create: vi.fn(),
      findMany: vi.fn(),
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

const feature = {
  id: 'feat-1',
  projectId: 'proj-1',
  name: 'Search',
  description: 'Search functionality',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('FeaturesService', () => {
  describe('create', () => {
    it('creates a feature for an org member', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        feature,
      );

      const result = await service.create('org-1', 'proj-1', 'user-1', {
        name: 'Search',
        description: 'Search functionality',
      });

      expect(result).toMatchObject({
        id: 'feat-1',
        projectId: 'proj-1',
        name: 'Search',
        description: 'Search functionality',
        status: 'ACTIVE',
      });
      expect(prisma.feature.create).toHaveBeenCalledWith({
        data: {
          projectId: 'proj-1',
          name: 'Search',
          description: 'Search functionality',
        },
      });
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.create('org-1', 'proj-1', 'user-2', { name: 'Search' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for missing project', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.create('org-1', 'proj-999', 'user-1', { name: 'Search' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByProject', () => {
    it('returns features for org member', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        feature,
      ]);

      const result = await service.findByProject('org-1', 'proj-1', 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'feat-1', name: 'Search' });
      expect(prisma.feature.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns empty array when no features exist', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        [],
      );

      const result = await service.findByProject('org-1', 'proj-1', 'user-1');

      expect(result).toEqual([]);
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.findByProject('org-1', 'proj-1', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
