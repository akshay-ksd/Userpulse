import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MeController } from './me/me.controller.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { FeaturesModule } from './features/features.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { EventProcessorModule } from './event-processor/event-processor.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { FunnelsModule } from './funnels/funnels.module.js';
import { AnalysisRunsModule } from './analysis-runs/analysis-runs.module.js';
import { RecommendationsModule } from './recommendations/recommendations.module.js';
import { RetentionModule } from './retention/retention.module.js';
import { DataDeletionModule } from './data-deletion/data-deletion.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

@Module({
  imports: [
    AuthenticationModule.forRoot({
      session: {
        absoluteTtl: '7d',
        idleTtl: '1d',
        cookie: { secure: process.env.NODE_ENV === 'production' && WEB_ORIGIN.startsWith('https') },
        trustedOrigins: [WEB_ORIGIN],
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    ApiKeysModule,
    FeaturesModule,
    IngestionModule,
    EventProcessorModule,
    AnalyticsModule,
    FunnelsModule,
    AnalysisRunsModule,
    RecommendationsModule,
    RetentionModule,
    DataDeletionModule,
    HealthModule,
  ],
  controllers: [AppController, MeController],
  providers: [AppService],
})
export class AppModule {}
