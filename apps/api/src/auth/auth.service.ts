import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import type { RegisterDto } from './register.dto.js';
import type { SignInDto } from './sign-in.dto.js';

const BCRYPT_SALT_ROUNDS = 10;

// Compared when the email is unknown, so an unknown account and a wrong
// password take the same time and neither reveals which emails are registered.
const DUMMY_PASSWORD_HASH =
  '$2b$10$yRm2ZrCmT0FqLSP5c7nc5.7KUqT50BFmbbPqILjWh/9/RWD4bXZNS';

export interface RegisteredUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<RegisteredUser> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    try {
      return await this.prisma.user.create({
        data: { email: dto.email, passwordHash, name: dto.name },
        select: { id: true, email: true, name: true, createdAt: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }
      throw error;
    }
  }

  /** The user, or `null` when the email or the password is wrong. */
  async verifyCredentials(dto: SignInDto): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const valid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !valid) {
      return null;
    }
    return { id: user.id, email: user.email, name: user.name };
  }
}
