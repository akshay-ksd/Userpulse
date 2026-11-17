import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { RecommendationsService } from './recommendations.service.js';

@Controller('organizations/:orgId/projects/:projectId/recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.recommendationsService.findByProject(orgId, projectId, user.id);
  }

  @Get(':recommendationId')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('recommendationId') recommendationId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.recommendationsService.findOne(
      orgId,
      projectId,
      recommendationId,
      user.id,
    );
  }
}
