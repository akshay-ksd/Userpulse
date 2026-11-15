import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Public, SignInService } from '@nestjs/authentication';
import { AuthService, type RegisteredUser } from './auth.service.js';
import type { AuthUser } from './auth-user.js';
import {
  forgotPasswordSchema,
  type ForgotPasswordDto,
} from './forgot-password.dto.js';
import { registerSchema, type RegisterDto } from './register.dto.js';
import {
  resetPasswordSchema,
  type ResetPasswordDto,
} from './reset-password.dto.js';
import { signInSchema, type SignInDto } from './sign-in.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly signInService: SignInService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  register(
    @Body({ schema: registerSchema }) dto: RegisterDto,
  ): Promise<RegisteredUser> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body({ schema: signInSchema }) dto: SignInDto,
  ): Promise<{ user: AuthUser }> {
    const user = await this.authService.verifyCredentials(dto);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    await this.signInService.signIn(user.id, { method: 'password' });
    return { user };
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut(): Promise<void> {
    await this.signInService.signOut();
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(
    @Body({ schema: forgotPasswordSchema }) dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto);
    return {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body({ schema: resetPasswordSchema }) dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto);
    return { message: 'Your password has been reset. You can now sign in.' };
  }
}
