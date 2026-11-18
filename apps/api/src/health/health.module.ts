import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HealthController } from './health.controller.js';
import { HealthMetricsController } from './health-metrics.controller.js';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';
import { PlatformHealthService } from './platform-health.service.js';
import { AlertEvaluatorService } from './alert-evaluator.service.js';
import { AlertLoggerService } from './alert-logger.service.js';

@Module({
  imports: [TerminusModule, PrismaModule],
  controllers: [HealthController, HealthMetricsController],
  providers: [
    HttpMetricsInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: HttpMetricsInterceptor,
    },
    PlatformHealthService,
    AlertEvaluatorService,
    AlertLoggerService,
  ],
  exports: [HttpMetricsInterceptor],
})
export class HealthModule {}
