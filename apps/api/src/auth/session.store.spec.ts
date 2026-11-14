import { AuthenticationStorage } from '@nestjs/authentication';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrismaSessionStore } from './session.store.js';

function createStore() {
  const session = {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  };
  const prisma = { session } as unknown as PrismaService;
  const storage = new AuthenticationStorage();
  const store = new PrismaSessionStore(prisma, storage);
  return { store, session, storage };
}

const record = {
  id: 'session-1',
  userId: 'user-1',
  createdAt: new Date('2026-11-14T00:00:00Z'),
  expiresAt: new Date('2026-11-21T00:00:00Z'),
  lastActiveAt: new Date('2026-11-14T00:00:00Z'),
};

describe('PrismaSessionStore', () => {
  it('registers itself as the sessions source', () => {
    const { store, storage } = createStore();
    expect(storage.sessions).toBe(store);
  });

  it('touches a session only forward and only if it still exists', async () => {
    const { store, session } = createStore();
    const at = new Date('2026-11-14T01:00:00Z');

    await store.touchSession(record.id, at);

    // One conditional write: a request racing a sign-out must not resurrect
    // the session, and lastActiveAt never moves backwards.
    expect(session.updateMany).toHaveBeenCalledWith({
      where: { id: record.id, lastActiveAt: { lt: at } },
      data: { lastActiveAt: at },
    });
  });

  it('resolves whether deleteSession removed the row', async () => {
    const { store, session } = createStore();
    session.deleteMany.mockResolvedValueOnce({ count: 1 });
    session.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(store.deleteSession(record.id)).resolves.toBe(true);
    await expect(store.deleteSession(record.id)).resolves.toBe(false);
  });

  it('deletes expired sessions when creating a new one', async () => {
    const { store, session } = createStore();

    await store.createSession(record);

    expect(session.create).toHaveBeenCalledWith({ data: record });
    expect(session.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: record.createdAt } },
    });
  });

  it('omits null mfa and metadata from read records', async () => {
    const { store, session } = createStore();
    session.findUnique.mockResolvedValue({
      ...record,
      mfa: null,
      metadata: null,
    });

    const result = await store.getSession(record.id);

    expect(result).toEqual(record);
    expect(result).not.toHaveProperty('mfa');
    expect(result).not.toHaveProperty('metadata');
  });

  it('returns undefined for an unknown session', async () => {
    const { store, session } = createStore();
    session.findUnique.mockResolvedValue(null);

    await expect(store.getSession('nope')).resolves.toBeUndefined();
  });
});
