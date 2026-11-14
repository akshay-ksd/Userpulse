import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MeController } from './me/me.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

@Module({
  imports: [
    AuthenticationModule.forRoot({
      session: {
        absoluteTtl: '7d',
        idleTtl: '1d',
        // The web app runs on another origin than the API in development.
        trustedOrigins: [WEB_ORIGIN],
      },
    }),
    PrismaModule,
    AuthModule,
  ],
  controllers: [AppController, MeController],
  providers: [AppService],
})
export class AppModule {}
