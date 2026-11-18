import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DataDeletionService } from './data-deletion.service.js';

function mockPrisma() {
  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    dataDeletionRequest: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    event: { count: vi.fn().mockResolvedValue(100) },
    recommendation: { count: vi.fn().mockResolvedValue(5) },
    analysisRun: { count: vi.fn().mockResolvedValue(2) },
    funnel: { count: vi.fn().mockResolvedValue(1) },
    feature: { count: vi.fn().mockResolvedValue(3) },
    featureEventMapping: { count: vi.fn().mockResolvedValue(7) },
    projectApiKey: { count: vi.fn().mockResolvedValue(2) },
    analysisSchedule: { count: vi.fn().mockResolvedValue(1) },
  } as unknown as PrismaService;
}

const NOW = new Date('2026-11-18T10:00:00Z');

function makeRequest(overrides = {}) {
  return {
    id: 'req-1',
    projectId: 'proj-1',
    organizationId: 'org-1',
    requestedBy: 'user-1',
    status: 'PENDING',
    scope: {
      events: 100,
      recommendations: 5,
      analysisRuns: 2,
      funnels: 1,
      features: 3,
      featureEventMappings: 7,
      apiKeys: 2,
      analysisSchedules: 1,
    },
    eventsDeleted: 0,
    recordsDeleted: 0,
    error: null,
    confirmedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('DataDeletionService', () => {
  let service: DataDeletionService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new DataDeletionService(prisma);
  });

  describe('createRequest', () => {
    it('creates a PENDING request with correct scope', async () => {
      const request = makeRequest();
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'proj-1',
        organizationId: 'org-1',
      });
      (
        prisma.dataDeletionRequest.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        prisma.dataDeletionRequest.create as ReturnType<typeof vi.fn>
      ).mockResolvedValue(request);

      const result = await service.createRequest('org-1', 'proj-1', 'user-1');

      expect(result.status).toBe('PENDING');
      expect(result.scope.events).toBe(100);
      expect(result.consequences).toContain('permanently delete');
      expect(result.consequences).toContain('backup');
      expect(prisma.dataDeletionRequest.create).toHaveBeenCalled();
    });

    it('rejects non-owners', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });

      await expect(
        service.createRequest('org-1', 'proj-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects non-members', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.createRequest('org-1', 'proj-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when active request exists', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'proj-1',
        organizationId: 'org-1',
      });
      (
        prisma.dataDeletionRequest.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(makeRequest());

      await expect(
        service.createRequest('org-1', 'proj-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects for non-existent project', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.createRequest('org-1', 'proj-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmRequest', () => {
    it('confirms a pending request', async () => {
      const confirmed = makeRequest({ status: 'CONFIRMED', confirmedAt: NOW });
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (
        prisma.dataDeletionRequest.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(makeRequest());
      (
        prisma.dataDeletionRequest.update as ReturnType<typeof vi.fn>
      ).mockResolvedValue(confirmed);

      const result = await service.confirmRequest('org-1', 'req-1', 'user-1');
      expect(result.status).toBe('CONFIRMED');
    });

    it('rejects confirmation of non-pending request', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (
        prisma.dataDeletionRequest.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(makeRequest({ status: 'PROCESSING' }));

      await expect(
        service.confirmRequest('org-1', 'req-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects non-owner', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });

      await expect(
        service.confirmRequest('org-1', 'req-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelRequest', () => {
    it('cancels a pending request', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (
        prisma.dataDeletionRequest.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(makeRequest());
      (
        prisma.dataDeletionRequest.update as ReturnType<typeof vi.fn>
      ).mockResolvedValue(makeRequest({ status: 'CANCELLED' }));

      await service.cancelRequest('org-1', 'req-1', 'user-1');
      expect(prisma.dataDeletionRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'CANCELLED' },
      });
    });

    it('rejects cancellation of non-pending request', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (
        prisma.dataDeletionRequest.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(makeRequest({ status: 'CONFIRMED' }));

      await expect(
        service.cancelRequest('org-1', 'req-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listRequests', () => {
    it('returns requests for a member', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });
      (
        prisma.dataDeletionRequest.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([makeRequest()]);

      const result = await service.listRequests('org-1', 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].consequences).toContain('permanently delete');
    });
  });

  describe('getRequest', () => {
    it('returns a single request', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });
      (
        prisma.dataDeletionRequest.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(makeRequest());

      const result = await service.getRequest('org-1', 'req-1', 'user-1');
      expect(result.id).toBe('req-1');
    });

    it('rejects for non-existent request', async () => {
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });
      (
        prisma.dataDeletionRequest.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.getRequest('org-1', 'req-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
