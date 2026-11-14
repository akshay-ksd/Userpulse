import { ConflictException } from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { RegisterDto } from './register.dto.js';

function createService() {
  const create = vi.fn();
  const prisma = { user: { create } } as unknown as PrismaService;
  return { service: new AuthService(prisma), create };
}

const dto: RegisterDto = {
  email: 'jane@example.com',
  password: 'password1',
  name: 'Jane',
};

describe('AuthService', () => {
  it('registers a user and returns only public fields', async () => {
    const { service, create } = createService();
    const createdAt = new Date('2026-11-14T00:00:00Z');
    create.mockResolvedValue({
      id: 'user-1',
      email: dto.email,
      name: dto.name,
      createdAt,
    });

    const result = await service.register(dto);

    expect(result).toEqual({
      id: 'user-1',
      email: dto.email,
      name: dto.name,
      createdAt,
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(create).toHaveBeenCalledWith({
      data: {
        email: dto.email,
        passwordHash: expect.any(String),
        name: dto.name,
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    const { service, create } = createService();
    create.mockImplementation(() =>
      Promise.resolve({
        id: 'user-1',
        email: dto.email,
        name: null,
        createdAt: new Date(),
      }),
    );

    await service.register(dto);

    const { passwordHash } = create.mock.calls[0][0].data as {
      passwordHash: string;
    };
    expect(passwordHash).not.toBe(dto.password);
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(dto.password, passwordHash)).toBe(true);
  });

  it('rejects a duplicate email with a clear 409 message', async () => {
    const { service, create } = createService();
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(service.register(dto)).rejects.toThrow(ConflictException);
    await expect(service.register(dto)).rejects.toThrow(
      'An account with this email already exists.',
    );
  });

  it('rethrows unexpected persistence errors', async () => {
    const { service, create } = createService();
    const failure = new Error('connection lost');
    create.mockRejectedValue(failure);

    await expect(service.register(dto)).rejects.toThrow(failure);
  });
});

describe('AuthService.verifyCredentials', () => {
  const signInDto = { email: 'jane@example.com', password: 'password1' };

  function createVerifyService() {
    const findUnique = vi.fn();
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    return { service: new AuthService(prisma), findUnique };
  }

  it('returns the public user for valid credentials', async () => {
    const { service, findUnique } = createVerifyService();
    findUnique.mockResolvedValue({
      id: 'user-1',
      email: signInDto.email,
      name: 'Jane',
      passwordHash: await bcrypt.hash(signInDto.password, 10),
    });

    const result = await service.verifyCredentials(signInDto);

    expect(result).toEqual({
      id: 'user-1',
      email: signInDto.email,
      name: 'Jane',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns null for a wrong password', async () => {
    const { service, findUnique } = createVerifyService();
    findUnique.mockResolvedValue({
      id: 'user-1',
      email: signInDto.email,
      name: 'Jane',
      passwordHash: await bcrypt.hash('otherpass2', 10),
    });

    await expect(service.verifyCredentials(signInDto)).resolves.toBeNull();
  });

  it('returns null for an unknown email, after a dummy hash comparison', async () => {
    const { service, findUnique } = createVerifyService();
    findUnique.mockResolvedValue(null);
    const compare = vi.spyOn(bcrypt, 'compare');

    await expect(service.verifyCredentials(signInDto)).resolves.toBeNull();
    // A bcrypt comparison still ran, so the response time matches a known email.
    expect(compare).toHaveBeenCalledWith(
      signInDto.password,
      expect.stringMatching(/^\$2[aby]\$/),
    );
    compare.mockRestore();
  });
});
