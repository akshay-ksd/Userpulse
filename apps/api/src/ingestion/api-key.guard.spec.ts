import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';
import { createHash } from 'node:crypto';

function mockExecutionContext(authHeader?: string) {
  const request: Record<string, unknown> = { headers: {} };
  if (authHeader !== undefined) {
    (request.headers as Record<string, string>).authorization = authHeader;
  }
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    request,
  };
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let prisma: {
    projectApiKey: { findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      projectApiKey: { findUnique: vi.fn() },
    };
    guard = new ApiKeyGuard(prisma as never);
  });

  it('passes and attaches payload for a valid key', async () => {
    const rawKey = 'test-api-key-value';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    prisma.projectApiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      keyHash,
      revokedAt: null,
      project: { id: 'proj-1', organizationId: 'org-1', status: 'ACTIVE' },
    });

    const ctx = mockExecutionContext(`Bearer ${rawKey}`);
    const result = await guard.canActivate(ctx as never);
    expect(result).toBe(true);
    expect(ctx.request.apiKeyPayload).toEqual({
      projectId: 'proj-1',
      organizationId: 'org-1',
      apiKeyId: 'key-1',
    });
  });

  it('throws 401 for missing Authorization header', async () => {
    const ctx = mockExecutionContext();
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws 401 for non-Bearer token', async () => {
    const ctx = mockExecutionContext('Basic abc123');
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws 401 for non-existent key', async () => {
    prisma.projectApiKey.findUnique.mockResolvedValue(null);
    const ctx = mockExecutionContext('Bearer unknown-key');
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws 401 for revoked key', async () => {
    prisma.projectApiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      revokedAt: new Date(),
      project: { id: 'proj-1', organizationId: 'org-1', status: 'ACTIVE' },
    });
    const ctx = mockExecutionContext('Bearer revoked-key');
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws 403 for archived project', async () => {
    prisma.projectApiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      revokedAt: null,
      project: { id: 'proj-1', organizationId: 'org-1', status: 'ARCHIVED' },
    });
    const ctx = mockExecutionContext('Bearer valid-key');
    await expect(guard.canActivate(ctx as never)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
