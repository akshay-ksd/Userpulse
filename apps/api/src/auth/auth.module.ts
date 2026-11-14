import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionAuth } from './session-auth.provider.js';
import { PrismaSessionStore } from './session.store.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionAuth, PrismaSessionStore],
})
export class AuthModule {}
