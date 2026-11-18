import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import { RecommendationsService } from './recommendations.service.js';

const updateStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED', 'DEFERRED', 'PUBLISHED']),
  reason: z.string().max(1000).optional(),
});

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
    @Query('status') status?: string,
  ) {
    return this.recommendationsService.findByProject(
      orgId,
      projectId,
      user.id,
      status,
    );
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

  @Patch(':recommendationId/status')
  async updateStatus(
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('recommendationId') recommendationId: string,
    @CurrentUser() user: { id: string },
    @Body({ schema: updateStatusSchema })
    body: z.infer<typeof updateStatusSchema>,
  ) {
    return this.recommendationsService.updateStatus(
      orgId,
      projectId,
      recommendationId,
      user.id,
      body.status,
      body.reason,
    );
  }
}
