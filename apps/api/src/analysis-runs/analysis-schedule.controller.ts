import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Body,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import {
  upsertScheduleSchema,
  type UpsertScheduleDto,
} from './analysis-schedule.dto.js';
import {
  AnalysisScheduleService,
  type AnalysisScheduleInfo,
} from './analysis-schedule.service.js';

@Controller('organizations/:orgId/projects/:projectId/analysis-schedule')
export class AnalysisScheduleController {
  constructor(private readonly scheduleService: AnalysisScheduleService) {}

  @Put()
  @HttpCode(200)
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Body({ schema: upsertScheduleSchema }) dto: UpsertScheduleDto,
  ): Promise<AnalysisScheduleInfo> {
    return this.scheduleService.upsert(orgId, projectId, user.id, dto);
  }

  @Get()
  find(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<AnalysisScheduleInfo | null> {
    return this.scheduleService.findByProject(orgId, projectId, user.id);
  }

  @Delete()
  @HttpCode(200)
  disable(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<AnalysisScheduleInfo> {
    return this.scheduleService.disable(orgId, projectId, user.id);
  }
}
