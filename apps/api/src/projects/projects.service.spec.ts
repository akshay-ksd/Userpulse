import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from './projects.service.js';

function mockPrisma() {
  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    event: {
      aggregate: vi.fn(),
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
  description: 'A test app',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ProjectsService', () => {
  describe('create', () => {
    it('creates a project for an org member', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );

      const result = await service.create('org-1', 'user-1', {
        name: 'My App',
        description: 'A test app',
      });

      expect(result).toMatchObject({
        id: 'proj-1',
        organizationId: 'org-1',
        name: 'My App',
        description: 'A test app',
        status: 'ACTIVE',
      });
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'My App',
          description: 'A test app',
        },
      });
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.create('org-1', 'user-2', { name: 'My App' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByOrganization', () => {
    it('returns active projects for org member', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        project,
      ]);

      const result = await service.findByOrganization('org-1', 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'proj-1', name: 'My App' });
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.findByOrganization('org-1', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('returns project for org member', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );

      const result = await service.findOne('org-1', 'proj-1', 'user-1');

      expect(result).toMatchObject({ id: 'proj-1', organizationId: 'org-1' });
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.findOne('org-1', 'proj-1', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong org', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.findOne('org-1', 'proj-999', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates project name for org member', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);
      const updated = { ...project, name: 'Renamed App' };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.project.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        updated,
      );

      const result = await service.update('org-1', 'proj-1', 'user-1', {
        name: 'Renamed App',
      });

      expect(result.name).toBe('Renamed App');
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: { name: 'Renamed App' },
      });
    });

    it('archives a project', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);
      const archived = { ...project, status: 'ARCHIVED' };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.project.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        archived,
      );

      const result = await service.update('org-1', 'proj-1', 'user-1', {
        status: 'ARCHIVED',
      });

      expect(result.status).toBe('ARCHIVED');
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.update('org-1', 'proj-1', 'user-2', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for missing project', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.update('org-1', 'proj-999', 'user-1', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEventStatus', () => {
    it('returns event count and timestamps for project with events', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);
      const latestDate = new Date('2026-11-15T10:00:00Z');
      const earliestDate = new Date('2026-11-14T08:00:00Z');

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.event.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
        _count: 42,
        _max: { ingestedAt: latestDate },
        _min: { ingestedAt: earliestDate },
      });

      const result = await service.getEventStatus('org-1', 'proj-1', 'user-1');

      expect(result).toEqual({
        totalEvents: 42,
        latestEventAt: latestDate,
        earliestEventAt: earliestDate,
      });
      expect(prisma.event.aggregate).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', validationStatus: 'VALID' },
        _count: true,
        _max: { ingestedAt: true },
        _min: { ingestedAt: true },
      });
    });

    it('returns zero count and null timestamps for project with no events', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (prisma.event.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
        _count: 0,
        _max: { ingestedAt: null },
        _min: { ingestedAt: null },
      });

      const result = await service.getEventStatus('org-1', 'proj-1', 'user-1');

      expect(result).toEqual({
        totalEvents: 0,
        latestEventAt: null,
        earliestEventAt: null,
      });
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new ProjectsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.getEventStatus('org-1', 'proj-1', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
