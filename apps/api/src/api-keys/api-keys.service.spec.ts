import { NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiKeysService } from './api-keys.service.js';

function mockPrisma() {
  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    projectApiKey: {
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

describe('ApiKeysService', () => {
  describe('create', () => {
    it('creates a credential and returns the full key', async () => {
      const prisma = mockPrisma();
      const service = new ApiKeysService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (
        prisma.projectApiKey.create as ReturnType<typeof vi.fn>
      ).mockImplementation(async ({ data }) => ({
        id: 'key-1',
        ...data,
        createdAt: new Date(),
        revokedAt: null,
        lastUsedAt: null,
      }));

      const result = await service.create('org-1', 'proj-1', 'user-1', {
        name: 'Production',
      });

      expect(result.id).toBe('key-1');
      expect(result.name).toBe('Production');
      expect(result.key).toBeDefined();
      expect(result.key.length).toBeGreaterThan(8);
      expect(result.keyPrefix).toBe(result.key.slice(0, 8));
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('stores a SHA-256 hash, not the raw key', async () => {
      const prisma = mockPrisma();
      const service = new ApiKeysService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );

      let storedData: Record<string, unknown> = {};
      (
        prisma.projectApiKey.create as ReturnType<typeof vi.fn>
      ).mockImplementation(async ({ data }) => {
        storedData = data;
        return {
          id: 'key-1',
          ...data,
          createdAt: new Date(),
          revokedAt: null,
          lastUsedAt: null,
        };
      });

      const result = await service.create('org-1', 'proj-1', 'user-1', {
        name: 'Test',
      });

      const expectedHash = createHash('sha256')
        .update(result.key)
        .digest('hex');
      expect(storedData.keyHash).toBe(expectedHash);
      expect(storedData.keyHash).not.toBe(result.key);
    });

    it('stores createdBy as the userId', async () => {
      const prisma = mockPrisma();
      const service = new ApiKeysService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );

      let storedData: Record<string, unknown> = {};
      (
        prisma.projectApiKey.create as ReturnType<typeof vi.fn>
      ).mockImplementation(async ({ data }) => {
        storedData = data;
        return {
          id: 'key-1',
          ...data,
          createdAt: new Date(),
          revokedAt: null,
          lastUsedAt: null,
        };
      });

      await service.create('org-1', 'proj-1', 'user-1', { name: 'Test' });

      expect(storedData.createdBy).toBe('user-1');
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new ApiKeysService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.create('org-1', 'proj-1', 'user-2', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-existent project', async () => {
      const prisma = mockPrisma();
      const service = new ApiKeysService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.create('org-1', 'proj-999', 'user-1', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByProject', () => {
    it('returns credentials without full key or hash', async () => {
      const prisma = mockPrisma();
      const service = new ApiKeysService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (
        prisma.projectApiKey.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          id: 'key-1',
          name: 'Production',
          keyPrefix: 'abcd1234',
          keyHash: 'somehash',
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        },
      ]);

      const result = await service.findByProject('org-1', 'proj-1', 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'key-1',
        name: 'Production',
        keyPrefix: 'abcd1234',
      });
      expect(
        (result[0] as unknown as Record<string, unknown>).key,
      ).toBeUndefined();
      expect(
        (result[0] as unknown as Record<string, unknown>).keyHash,
      ).toBeUndefined();
    });

    it('returns only non-revoked credentials', async () => {
      const prisma = mockPrisma();
      const service = new ApiKeysService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(membership);
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        project,
      );
      (
        prisma.projectApiKey.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      await service.findByProject('org-1', 'proj-1', 'user-1');

      expect(prisma.projectApiKey.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1', revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new ApiKeysService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.findByProject('org-1', 'proj-1', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
