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
} from './analysis-runs.service.js';

@Controller('organizations/:orgId/projects/:projectId/analysis-runs')
export class AnalysisRunsController {
  constructor(private readonly analysisRunsService: AnalysisRunsService) {}

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
  ): Promise<AnalysisRunInfo> {
    return this.analysisRunsService.findOne(orgId, projectId, runId, user.id);
  }
}
