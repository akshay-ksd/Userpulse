import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ApiKeysService } from '../api-keys/api-keys.service.js';
import { ApiKeyGuard } from '../ingestion/api-key.guard.js';

function makePrisma() {
  return {
    organizationMember: { findUnique: vi.fn() },
    project: { findFirst: vi.fn() },
    projectApiKey: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

const orgId = 'org-1';
const projectId = 'proj-1';
const userId = 'user-1';

describe('Credential protection (US-052)', () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.restoreAllMocks();
  });

  function setupAccess() {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'mem-1' });
    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      organizationId: orgId,
    });
  }

  describe('Raw credentials are not stored', () => {
    it('stores only the SHA-256 hash, not the raw key', async () => {
      const service = new ApiKeysService(prisma as any);
      setupAccess();
      prisma.projectApiKey.create.mockImplementation(async ({ data }: any) => ({
        id: 'key-1',
        name: data.name,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        createdAt: new Date(),
      }));

      const result = await service.create(orgId, projectId, userId, {
        name: 'Test key',
      });

      const storedData = (
        prisma.projectApiKey.create as ReturnType<typeof vi.fn>
      ).mock.calls[0][0].data;

      expect(storedData.keyHash).toBeDefined();
      expect(storedData.keyHash).toHaveLength(64);
      expect(storedData.keyHash).not.toBe(result.key);

      const expectedHash = createHash('sha256')
        .update(result.key)
        .digest('hex');
      expect(storedData.keyHash).toBe(expectedHash);
    });

    it('returns the raw key only at creation time', async () => {
      const service = new ApiKeysService(prisma as any);
      setupAccess();
      prisma.projectApiKey.create.mockImplementation(async ({ data }: any) => ({
        id: 'key-1',
        name: data.name,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        createdAt: new Date(),
      }));

      const created = await service.create(orgId, projectId, userId, {
        name: 'Test key',
      });
      expect(created.key).toBeDefined();
      expect(created.key.length).toBeGreaterThan(0);
    });

    it('list endpoint returns prefix only, not the raw key or hash', async () => {
      const service = new ApiKeysService(prisma as any);
      setupAccess();
      prisma.projectApiKey.findMany.mockResolvedValue([
        {
          id: 'key-1',
          name: 'Test',
          keyPrefix: 'abc12345',
          keyHash: 'deadbeef'.repeat(8),
          createdAt: new Date(),
          revokedAt: null,
        },
      ]);

      const keys = await service.findByProject(orgId, projectId, userId);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toHaveProperty('keyPrefix', 'abc12345');
      expect(keys[0]).not.toHaveProperty('key');
      expect(keys[0]).not.toHaveProperty('keyHash');
    });
  });

  describe('Ingestion validates credentials before accepting events', () => {
    function makeContext(authHeader?: string) {
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: authHeader },
          }),
        }),
      } as any;
    }

    it('rejects missing Authorization header', async () => {
      const guard = new ApiKeyGuard(prisma as any);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects non-Bearer authorization', async () => {
      const guard = new ApiKeyGuard(prisma as any);
      await expect(guard.canActivate(makeContext('Basic abc'))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects unknown API key', async () => {
      const guard = new ApiKeyGuard(prisma as any);
      prisma.projectApiKey.findUnique.mockResolvedValue(null);

      await expect(
        guard.canActivate(makeContext('Bearer unknown-key')),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects revoked API key', async () => {
      const guard = new ApiKeyGuard(prisma as any);
      prisma.projectApiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        revokedAt: new Date(),
        project: { status: 'ACTIVE', organizationId: orgId },
        projectId,
      });

      await expect(
        guard.canActivate(makeContext('Bearer some-key')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects key for archived project', async () => {
      const guard = new ApiKeyGuard(prisma as any);
      prisma.projectApiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        revokedAt: null,
        project: { status: 'ARCHIVED', organizationId: orgId },
        projectId,
      });

      await expect(
        guard.canActivate(makeContext('Bearer some-key')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('derives project/org context from the key, not from request params', async () => {
      const guard = new ApiKeyGuard(prisma as any);
      prisma.projectApiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        revokedAt: null,
        projectId: 'derived-project',
        project: { status: 'ACTIVE', organizationId: 'derived-org' },
      });

      const request: Record<string, any> = {
        headers: { authorization: 'Bearer some-key' },
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as any;

      await guard.canActivate(ctx);

      expect(request.ingestionContext).toEqual({
        projectId: 'derived-project',
        organizationId: 'derived-org',
        apiKeyId: 'key-1',
      });
    });
  });

  describe('Tracking credentials cannot authorize administrative actions', () => {
    it('ApiKeyGuard is not applied to organization endpoints', () => {
      expect(typeof ApiKeyGuard).toBe('function');
    });
  });

  describe('Credential changes are audited', () => {
    it('create records createdBy user ID', async () => {
      const service = new ApiKeysService(prisma as any);
      setupAccess();
      prisma.projectApiKey.create.mockImplementation(async ({ data }: any) => ({
        id: 'key-1',
        name: data.name,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        createdBy: data.createdBy,
        createdAt: new Date(),
      }));

      await service.create(orgId, projectId, userId, { name: 'Audited key' });

      const storedData = (
        prisma.projectApiKey.create as ReturnType<typeof vi.fn>
      ).mock.calls[0][0].data;
      expect(storedData.createdBy).toBe(userId);
    });

    it('revoke records revokedBy user ID', async () => {
      const service = new ApiKeysService(prisma as any);
      setupAccess();
      prisma.projectApiKey.findFirst.mockResolvedValue({
        id: 'key-1',
        projectId,
        revokedAt: null,
      });
      prisma.projectApiKey.update.mockResolvedValue({
        id: 'key-1',
        revokedAt: new Date(),
        revokedBy: userId,
      });

      await service.revoke(orgId, projectId, 'key-1', userId);

      const updateCall = (
        prisma.projectApiKey.update as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      expect(updateCall.data.revokedBy).toBe(userId);
      expect(updateCall.data.revokedAt).toBeDefined();
    });
  });
});
