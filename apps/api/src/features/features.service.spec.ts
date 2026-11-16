import { ConflictException, NotFoundException } from '@nestjs/common';
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
    featureEventMapping: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        featureEventMapping: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      }),
    ),
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

function setupAccess(prisma: ReturnType<typeof mockPrisma>) {
  (
    prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
  ).mockResolvedValue(membership);
  (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
    project,
  );
  (prisma.feature.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
    feature,
  );
}

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
        mappingCount: 0,
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
    it('returns features with mapping count for org member', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.feature.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ...feature, _count: { mappings: 3 } },
      ]);

      const result = await service.findByProject('org-1', 'proj-1', 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'feat-1',
        name: 'Search',
        mappingCount: 3,
      });
      expect(prisma.feature.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { mappings: true } } },
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
      const updated = {
        ...feature,
        name: 'Advanced Search',
        _count: { mappings: 2 },
      };

      setupAccess(prisma);
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
      expect(result.mappingCount).toBe(2);
      expect(prisma.feature.update).toHaveBeenCalledWith({
        where: { id: 'feat-1' },
        data: { name: 'Advanced Search' },
        include: { _count: { select: { mappings: true } } },
      });
    });

    it('updates feature description', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const updated = {
        ...feature,
        description: 'Updated desc',
        _count: { mappings: 0 },
      };

      setupAccess(prisma);
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
      const updated = {
        ...feature,
        description: null,
        _count: { mappings: 0 },
      };

      setupAccess(prisma);
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
        include: { _count: { select: { mappings: true } } },
      });
    });

    it('archives a feature', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const updated = {
        ...feature,
        status: 'ARCHIVED',
        _count: { mappings: 0 },
      };

      setupAccess(prisma);
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
      const restored = {
        ...feature,
        status: 'ACTIVE',
        _count: { mappings: 0 },
      };

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

  describe('getMappings', () => {
    it('returns mappings for a feature', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const mappings = [
        {
          id: 'map-1',
          featureId: 'feat-1',
          projectId: 'proj-1',
          eventName: 'search_performed',
          createdAt: new Date(),
        },
      ];

      setupAccess(prisma);
      (
        prisma.featureEventMapping.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mappings);

      const result = await service.getMappings(
        'org-1',
        'proj-1',
        'feat-1',
        'user-1',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'map-1',
        eventName: 'search_performed',
      });
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
        service.getMappings('org-1', 'proj-1', 'feat-999', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.getMappings('org-1', 'proj-1', 'feat-1', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setMappings', () => {
    it('sets event mappings for a feature', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const createdMappings = [
        {
          id: 'map-1',
          featureId: 'feat-1',
          projectId: 'proj-1',
          eventName: 'search_performed',
          createdAt: new Date(),
        },
        {
          id: 'map-2',
          featureId: 'feat-1',
          projectId: 'proj-1',
          eventName: 'search_results_viewed',
          createdAt: new Date(),
        },
      ];

      setupAccess(prisma);
      (
        prisma.featureEventMapping.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            featureEventMapping: {
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              createMany: vi
                .fn()
                .mockResolvedValue({ count: createdMappings.length }),
              findMany: vi.fn().mockResolvedValue(createdMappings),
            },
          }),
      );

      const result = await service.setMappings(
        'org-1',
        'proj-1',
        'feat-1',
        'user-1',
        ['search_performed', 'search_results_viewed'],
      );

      expect(result).toHaveLength(2);
      expect(result[0].eventName).toBe('search_performed');
    });

    it('clears all mappings when empty array is provided', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      setupAccess(prisma);
      (
        prisma.featureEventMapping.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            featureEventMapping: {
              deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
              findMany: vi.fn().mockResolvedValue([]),
            },
          }),
      );

      const result = await service.setMappings(
        'org-1',
        'proj-1',
        'feat-1',
        'user-1',
        [],
      );

      expect(result).toEqual([]);
    });

    it('throws ConflictException when event is mapped to another feature', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      setupAccess(prisma);
      (
        prisma.featureEventMapping.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: 'map-existing',
          featureId: 'feat-2',
          projectId: 'proj-1',
          eventName: 'button_click',
          feature: { name: 'Checkout' },
        },
      ]);

      await expect(
        service.setMappings('org-1', 'proj-1', 'feat-1', 'user-1', [
          'button_click',
        ]),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.setMappings('org-1', 'proj-1', 'feat-1', 'user-2', ['event_a']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMapping', () => {
    it('removes a mapping', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);
      const mapping = {
        id: 'map-1',
        featureId: 'feat-1',
        projectId: 'proj-1',
        eventName: 'search_performed',
      };

      setupAccess(prisma);
      (
        prisma.featureEventMapping.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mapping);
      (
        prisma.featureEventMapping.delete as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mapping);

      await service.removeMapping(
        'org-1',
        'proj-1',
        'feat-1',
        'map-1',
        'user-1',
      );

      expect(prisma.featureEventMapping.delete).toHaveBeenCalledWith({
        where: { id: 'map-1' },
      });
    });

    it('throws NotFoundException for non-existent mapping', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      setupAccess(prisma);
      (
        prisma.featureEventMapping.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.removeMapping('org-1', 'proj-1', 'feat-1', 'map-999', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new FeaturesService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.removeMapping('org-1', 'proj-1', 'feat-1', 'map-1', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
