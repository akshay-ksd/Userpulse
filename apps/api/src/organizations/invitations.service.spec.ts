import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { InvitationsService } from './invitations.service.js';

function mockPrisma() {
  return {
    $transaction: vi.fn(),
    organizationMember: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organizationInvitation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  } as unknown as PrismaService;
}

describe('InvitationsService', () => {
  describe('createInvitation', () => {
    it('creates an invitation when inviter is OWNER', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );
      (
        prisma.organizationInvitation.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        prisma.organizationInvitation.create as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-1',
        email: 'new@example.com',
        role: 'MEMBER',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const result = await service.createInvitation('org-1', 'user-1', {
        email: 'new@example.com',
        role: 'MEMBER',
      });

      expect(result.email).toBe('new@example.com');
      expect(result.status).toBe('PENDING');
    });

    it('rejects non-OWNER inviters', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });

      await expect(
        service.createInvitation('org-1', 'user-1', {
          email: 'new@example.com',
          role: 'MEMBER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects non-members', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.createInvitation('org-1', 'user-1', {
          email: 'new@example.com',
          role: 'MEMBER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects already-a-member email', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ role: 'OWNER' }) // inviter check
        .mockResolvedValueOnce({ role: 'MEMBER' }); // existing membership
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'existing-user',
      });

      await expect(
        service.createInvitation('org-1', 'user-1', {
          email: 'existing@example.com',
          role: 'MEMBER',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects duplicate pending invitation', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );
      (
        prisma.organizationInvitation.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: 'existing-inv',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 1000000),
      });

      await expect(
        service.createInvitation('org-1', 'user-1', {
          email: 'new@example.com',
          role: 'MEMBER',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('acceptInvitation', () => {
    it('accepts a valid invitation', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      const rawToken = 'test-token-value';
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      (
        prisma.organizationInvitation.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-1',
        email: 'user@example.com',
        role: 'MEMBER',
        status: 'PENDING',
        tokenHash,
        expiresAt: new Date(Date.now() + 1000000),
        organization: { name: 'Acme Corp' },
      });
      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([
        {},
        {},
      ]);

      const result = await service.acceptInvitation(
        rawToken,
        'user-1',
        'user@example.com',
      );

      expect(result.organizationName).toBe('Acme Corp');
      expect(result.role).toBe('MEMBER');
    });

    it('rejects wrong email', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      const rawToken = 'test-token';
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      (
        prisma.organizationInvitation.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-1',
        email: 'other@example.com',
        role: 'MEMBER',
        status: 'PENDING',
        tokenHash,
        expiresAt: new Date(Date.now() + 1000000),
        organization: { name: 'Acme Corp' },
      });

      await expect(
        service.acceptInvitation(rawToken, 'user-1', 'wrong@example.com'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects expired token', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      const rawToken = 'test-token';

      (
        prisma.organizationInvitation.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-1',
        email: 'user@example.com',
        role: 'MEMBER',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000),
        organization: { name: 'Acme Corp' },
      });

      await expect(
        service.acceptInvitation(rawToken, 'user-1', 'user@example.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects already-used invitation', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      const rawToken = 'test-token';

      (
        prisma.organizationInvitation.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-1',
        email: 'user@example.com',
        role: 'MEMBER',
        status: 'ACCEPTED',
        expiresAt: new Date(Date.now() + 1000000),
        organization: { name: 'Acme Corp' },
      });

      await expect(
        service.acceptInvitation(rawToken, 'user-1', 'user@example.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid token', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationInvitation.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.acceptInvitation('bad-token', 'user-1', 'user@example.com'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelInvitation', () => {
    it('cancels a pending invitation', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (
        prisma.organizationInvitation.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ id: 'inv-1', status: 'PENDING' });
      (
        prisma.organizationInvitation.update as ReturnType<typeof vi.fn>
      ).mockResolvedValue({});

      await expect(
        service.cancelInvitation('org-1', 'inv-1', 'user-1'),
      ).resolves.toBeUndefined();
    });

    it('rejects non-OWNER cancellation', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });

      await expect(
        service.cancelInvitation('org-1', 'inv-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws not found for non-existent invitation', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });
      (
        prisma.organizationInvitation.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.cancelInvitation('org-1', 'inv-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listInvitations', () => {
    it('returns pending invitations for OWNER', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'OWNER' });

      const invitations = [
        {
          id: 'inv-1',
          organizationId: 'org-1',
          email: 'a@example.com',
          role: 'MEMBER',
          status: 'PENDING',
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      ];
      (
        prisma.organizationInvitation.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue(invitations);

      const result = await service.listInvitations('org-1', 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('a@example.com');
    });

    it('rejects non-OWNER', async () => {
      const prisma = mockPrisma();
      const service = new InvitationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ role: 'MEMBER' });

      await expect(service.listInvitations('org-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
