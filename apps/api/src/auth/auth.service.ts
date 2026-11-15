import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import type { ForgotPasswordDto } from './forgot-password.dto.js';
import type { RegisterDto } from './register.dto.js';
import type { ResetPasswordDto } from './reset-password.dto.js';
import type { SignInDto } from './sign-in.dto.js';

const BCRYPT_SALT_ROUNDS = 10;
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

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
  private readonly logger = new Logger(AuthService.name);

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

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (!user) {
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        id: tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
      },
    });

    const webOrigin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
    this.logger.log(
      `Password reset link: ${webOrigin}/reset-password?token=${rawToken}`,
    );
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { id: tokenHash },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Reset link has expired or is invalid.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: resetToken.userId },
      }),
      this.prisma.session.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);
  }
}
