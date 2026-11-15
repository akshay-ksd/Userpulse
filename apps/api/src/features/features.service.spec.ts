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
      findFirst: vi.fn(),
      update: vi.fn(),
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

  describe('update', () => {
    it('updates feature name', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const updated = { ...feature, name: 'Advanced Search' };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        feature,
      );
      (prisma.feature.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        updated,
      );

      const result = await service.update(
        'org-1',
        'proj-1',
        'feat-1',
        'user-1',
        { name: 'Advanced Search' },
      );

      expect(result.name).toBe('Advanced Search');
      expect(prisma.feature.update).toHaveBeenCalledWith({
        where: { id: 'feat-1' },
        data: { name: 'Advanced Search' },
      });
    });

    it('updates feature description', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const updated = { ...feature, description: 'Updated desc' };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        feature,
      );
      (prisma.feature.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        updated,
      );

      const result = await service.update(
        'org-1',
        'proj-1',
        'feat-1',
        'user-1',
        { description: 'Updated desc' },
      );

      expect(result.description).toBe('Updated desc');
    });

    it('clears description with null', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const updated = { ...feature, description: null };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        feature,
      );
      (prisma.feature.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        updated,
      );

      const result = await service.update(
        'org-1',
        'proj-1',
        'feat-1',
        'user-1',
        { description: null },
      );

      expect(result.description).toBeNull();
      expect(prisma.feature.update).toHaveBeenCalledWith({
        where: { id: 'feat-1' },
        data: { description: null },
      });
    });

    it('archives a feature', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const updated = { ...feature, status: 'ARCHIVED' };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        feature,
      );
      (prisma.feature.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        updated,
      );

      const result = await service.update(
        'org-1',
        'proj-1',
        'feat-1',
        'user-1',
        { status: 'ARCHIVED' },
      );

      expect(result.status).toBe('ARCHIVED');
    });

    it('restores an archived feature', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const archived = { ...feature, status: 'ARCHIVED' };
      const restored = { ...feature, status: 'ACTIVE' };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        archived,
      );
      (prisma.feature.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        restored,
      );

      const result = await service.update(
        'org-1',
        'proj-1',
        'feat-1',
        'user-1',
        { status: 'ACTIVE' },
      );

      expect(result.status).toBe('ACTIVE');
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.update('org-1', 'proj-1', 'feat-1', 'user-2', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-existent feature', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.update('org-1', 'proj-1', 'feat-999', 'user-1', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for feature in wrong project', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.update('org-1', 'proj-1', 'feat-other', 'user-1', {
          name: 'X',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
