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
import { registerSchema, type RegisterDto } from './register.dto.js';
import { signInSchema, type SignInDto } from './sign-in.dto.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly signInService: SignInService,
  ) {}

  @Post('register')
  @HttpCode(201)
  register(
    @Body({ schema: registerSchema }) dto: RegisterDto,
  ): Promise<RegisteredUser> {
    return this.authService.register(dto);
  }

  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body({ schema: signInSchema }) dto: SignInDto,
  ): Promise<{ user: AuthUser }> {
    const user = await this.authService.verifyCredentials(dto);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    // Creates the session and sets the session cookie on the response.
    await this.signInService.signIn(user.id, { method: 'password' });
    return { user };
  }
}
