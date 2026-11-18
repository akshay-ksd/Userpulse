import { Controller, Get, HttpCode, Param, Post, Body } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import {
  requestAnalysisSchema,
  type RequestAnalysisDto,
} from './request-analysis.dto.js';
import {
  AnalysisRunsService,
  type AnalysisRunInfo,
  type AnalysisRunDetail,
} from './analysis-runs.service.js';
import { RecommendationsService } from '../recommendations/recommendations.service.js';

@Controller('organizations/:orgId/projects/:projectId/analysis-runs')
export class AnalysisRunsController {
  constructor(
    private readonly analysisRunsService: AnalysisRunsService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Post()
  @HttpCode(201)
  requestAnalysis(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Body({ schema: requestAnalysisSchema }) dto: RequestAnalysisDto,
  ): Promise<AnalysisRunInfo> {
    return this.analysisRunsService.requestAnalysis(
      orgId,
      projectId,
      user.id,
      dto,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<AnalysisRunInfo[]> {
    return this.analysisRunsService.findByProject(orgId, projectId, user.id);
  }

  @Get(':runId')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
  ): Promise<AnalysisRunDetail> {
    return this.analysisRunsService.findOne(orgId, projectId, runId, user.id);
  }

  @Get(':runId/recommendations')
  findRunRecommendations(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
  ) {
    return this.recommendationsService.findByAnalysisRun(
      orgId,
      projectId,
      runId,
      user.id,
    );
  }
}
