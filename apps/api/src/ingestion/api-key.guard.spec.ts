import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiKeyGuard, getIngestionContext } from './api-key.guard.js';

function mockPrisma() {
  return {
    projectApiKey: {
      findUnique: vi.fn(),
    },
  } as unknown as PrismaService;
}

function mockContext(authHeader?: string) {
  const request: any = {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  };
  return {
    request,
    executionContext: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any,
  };
}

const activeProject = {
  id: 'proj-1',
  organizationId: 'org-1',
  status: 'ACTIVE',
};

const activeKey = {
  id: 'key-1',
  projectId: 'proj-1',
  revokedAt: null,
  project: activeProject,
};

describe('ApiKeyGuard', () => {
  it('allows a valid, active API key', async () => {
    const prisma = mockPrisma();
    const guard = new ApiKeyGuard(prisma);
    const rawKey = 'test-api-key-value';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const { request, executionContext } = mockContext(`Bearer ${rawKey}`);

    (
      prisma.projectApiKey.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(activeKey);

    const result = await guard.canActivate(executionContext);

    expect(result).toBe(true);
    expect(prisma.projectApiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash },
      include: { project: true },
    });
    const ctx = getIngestionContext(request);
    expect(ctx.projectId).toBe('proj-1');
    expect(ctx.organizationId).toBe('org-1');
    expect(ctx.apiKeyId).toBe('key-1');
  });

  it('rejects missing Authorization header', async () => {
    const prisma = mockPrisma();
    const guard = new ApiKeyGuard(prisma);
    const { executionContext } = mockContext(undefined);

    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects malformed Authorization header (no Bearer prefix)', async () => {
    const prisma = mockPrisma();
    const guard = new ApiKeyGuard(prisma);
    const { executionContext } = mockContext('Basic abc123');

    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects empty Bearer token', async () => {
    const prisma = mockPrisma();
    const guard = new ApiKeyGuard(prisma);
    const { executionContext } = mockContext('Bearer ');

    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects unknown key hash', async () => {
    const prisma = mockPrisma();
    const guard = new ApiKeyGuard(prisma);
    const { executionContext } = mockContext('Bearer unknown-key');

    (
      prisma.projectApiKey.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects revoked key with ForbiddenException', async () => {
    const prisma = mockPrisma();
    const guard = new ApiKeyGuard(prisma);
    const { executionContext } = mockContext('Bearer some-key');

    (
      prisma.projectApiKey.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      ...activeKey,
      revokedAt: new Date(),
    });

    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects archived project with ForbiddenException', async () => {
    const prisma = mockPrisma();
    const guard = new ApiKeyGuard(prisma);
    const { executionContext } = mockContext('Bearer some-key');

    (
      prisma.projectApiKey.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      ...activeKey,
      project: { ...activeProject, status: 'ARCHIVED' },
    });

    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
