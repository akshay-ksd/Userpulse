import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';

@Controller('me')
export class MeController {
  @Get()
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
