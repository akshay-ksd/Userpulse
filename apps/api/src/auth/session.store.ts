import { Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type MfaState,
  type SessionRecord,
  type SessionStore,
} from '@nestjs/authentication';
import { Prisma, type Session } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';

function toRecord(row: Session): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastActiveAt: row.lastActiveAt,
    ...(row.mfa ? { mfa: row.mfa as MfaState } : {}),
    ...(row.metadata
      ? { metadata: row.metadata as Record<string, unknown> }
      : {}),
  };
}

/**
 * Keeps @nestjs/authentication sessions in PostgreSQL. Methods that decide
 * whether something happens once are single conditional statements, per the
 * package's store contract: a request racing a sign-out must not resurrect
 * the session, and of a rotation and a sign-out exactly one may win.
 */
@Injectable()
export class PrismaSessionStore implements SessionStore {
  constructor(
    private readonly prisma: PrismaService,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ sessions: this });
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const row = await this.prisma.session.findUnique({ where: { id } });
    return row ? toRecord(row) : undefined;
  }

  async createSession(record: SessionRecord): Promise<void> {
    const { mfa, metadata, ...data } = record;
    await this.prisma.session.create({
      data: {
        ...data,
        ...(mfa ? { mfa } : {}),
        ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
      },
    });
    // Keep the table bounded: expired rows go as new sessions are written.
    await this.prisma.session.deleteMany({
      where: { expiresAt: { lte: record.createdAt } },
    });
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    // Conditional update: a session deleted by a sign-out stays deleted.
    await this.prisma.session.updateMany({
      where: { id, lastActiveAt: { lt: lastActiveAt } },
      data: { lastActiveAt },
    });
  }

  async deleteSession(id: string): Promise<boolean> {
    const { count } = await this.prisma.session.deleteMany({ where: { id } });
    return count > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.prisma.session.findMany({ where: { userId } });
    return rows.map(toRecord);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
