import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RecommendationsController } from './recommendations.controller.js';
import { RecommendationsService } from './recommendations.service.js';
import { EvidenceGathererService } from './evidence-gatherer.service.js';
import { RecommendationGeneratorService } from './recommendation-generator.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    EvidenceGathererService,
    RecommendationGeneratorService,
  ],
  exports: [
    RecommendationsService,
    EvidenceGathererService,
    RecommendationGeneratorService,
  ],
})
export class RecommendationsModule {}
