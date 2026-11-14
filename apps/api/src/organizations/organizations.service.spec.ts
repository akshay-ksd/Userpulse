import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationsService } from './organizations.service.js';

function mockPrisma() {
  return {
    $transaction: vi.fn(),
    organizationMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  } as unknown as PrismaService;
}

describe('OrganizationsService', () => {
  describe('create', () => {
    it('creates org and member with OWNER role in a transaction', async () => {
      const prisma = mockPrisma();
      const service = new OrganizationsService(prisma);

      const org = {
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme-corp',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const member = { role: 'OWNER' };

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            organization: {
              create: vi.fn().mockResolvedValue(org),
            },
            organizationMember: {
              create: vi.fn().mockResolvedValue(member),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.create('user-1', { name: 'Acme Corp' });

      expect(result).toMatchObject({
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme-corp',
        role: 'OWNER',
      });
    });

    it('retries with a suffixed slug on collision', async () => {
      const prisma = mockPrisma();
      const service = new OrganizationsService(prisma);

      let attempt = 0;
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          attempt++;
          if (attempt === 1) {
            const error = new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed',
              { code: 'P2002', clientVersion: '0.0.0', meta: {} },
            );
            throw error;
          }
          const tx = {
            organization: {
              create: vi.fn().mockResolvedValue({
                id: 'org-1',
                name: 'Acme Corp',
                slug: 'acme-corp-abc123',
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
            },
            organizationMember: {
              create: vi.fn().mockResolvedValue({ role: 'OWNER' }),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.create('user-1', { name: 'Acme Corp' });
      expect(result.role).toBe('OWNER');
      expect(attempt).toBe(2);
    });
  });

  describe('findByUser', () => {
    it('returns only orgs where user is a member', async () => {
      const prisma = mockPrisma();
      const service = new OrganizationsService(prisma);

      (
        prisma.organizationMember.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          role: 'OWNER',
          organization: {
            id: 'org-1',
            name: 'Acme',
            slug: 'acme',
            createdAt: new Date(),
          },
        },
      ]);

      const result = await service.findByUser('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('OWNER');
    });
  });

  describe('findOneByUser', () => {
    it('throws NotFoundException for non-member', async () => {
      const prisma = mockPrisma();
      const service = new OrganizationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(service.findOneByUser('org-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns org for member', async () => {
      const prisma = mockPrisma();
      const service = new OrganizationsService(prisma);

      (
        prisma.organizationMember.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        role: 'MEMBER',
        organization: {
          id: 'org-1',
          name: 'Acme',
          slug: 'acme',
          createdAt: new Date(),
        },
      });

      const result = await service.findOneByUser('org-1', 'user-1');
      expect(result.id).toBe('org-1');
      expect(result.role).toBe('MEMBER');
    });
  });
});
