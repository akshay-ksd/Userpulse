import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  SessionCookieProvider,
  type SessionRecord,
} from '@nestjs/authentication';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';

@Injectable()
export class SessionAuth extends SessionCookieProvider<AuthUser> {
  constructor(
    private readonly prisma: PrismaService,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this);
  }

  // Called for every request with a live session cookie.
  // Returning null (the user was deleted) ends the session.
  validate(session: SessionRecord): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true },
    });
  }
}
