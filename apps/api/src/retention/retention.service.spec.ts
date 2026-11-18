import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RetentionService } from './retention.service.js';

function mockPrisma() {
  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    dataRetentionSetting: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  } as unknown as PrismaService;
}

describe('RetentionService', () => {
  let service: RetentionService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new RetentionService(prisma);
  });

  describe('getRetentionSettings', () => {
    it('returns existing settings for a member', async () => {
      const settings = {
        id: 'rs-1',
        organizationId: 'org-1',
        eventRetentionDays: 60,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });
      (
        prisma.dataRetentionSetting.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(settings);

      const result = await service.getRetentionSettings('org-1', 'user-1');
      expect(result).toEqual(settings);
    });

    it('creates default settings when none exist', async () => {
      const created = {
        id: 'rs-new',
        organizationId: 'org-1',
        eventRetentionDays: 90,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });
      (
        prisma.dataRetentionSetting.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        prisma.dataRetentionSetting.create as ReturnType<typeof vi.fn>
      ).mockResolvedValue(created);

      const result = await service.getRetentionSettings('org-1', 'user-1');
      expect(result.eventRetentionDays).toBe(90);
      expect(prisma.dataRetentionSetting.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', eventRetentionDays: 90 },
      });
    });

    it('rejects non-members', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.getRetentionSettings('org-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRetentionSettings', () => {
    it('updates settings for an owner', async () => {
      const updated = {
        id: 'rs-1',
        organizationId: 'org-1',
        eventRetentionDays: 180,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (
        prisma.dataRetentionSetting.upsert as ReturnType<typeof vi.fn>
      ).mockResolvedValue(updated);

      const result = await service.updateRetentionSettings(
        'org-1',
        'user-1',
        180,
      );
      expect(result.eventRetentionDays).toBe(180);
    });

    it('rejects non-owners', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });

      await expect(
        service.updateRetentionSettings('org-1', 'user-1', 180),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects non-members', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.updateRetentionSettings('org-1', 'user-1', 180),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDefaultRetentionDays', () => {
    it('returns 90', () => {
      expect(service.getDefaultRetentionDays()).toBe(90);
    });
  });
});
