import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import {
  createFunnelSchema,
  type CreateFunnelDto,
} from './create-funnel.dto.js';
import {
  updateFunnelSchema,
  type UpdateFunnelDto,
} from './update-funnel.dto.js';
import {
  FunnelsService,
  type FunnelInfo,
  type FunnelDetailInfo,
} from './funnels.service.js';

@Controller('organizations/:orgId/projects/:projectId/funnels')
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Body({ schema: createFunnelSchema }) dto: CreateFunnelDto,
  ): Promise<FunnelDetailInfo> {
    return this.funnelsService.create(orgId, projectId, user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<FunnelInfo[]> {
    return this.funnelsService.findByProject(orgId, projectId, user.id);
  }

  @Get('event-names')
  getEventNames(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<string[]> {
    return this.funnelsService.getProjectEventNames(orgId, projectId, user.id);
  }

  @Get(':funnelId')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('funnelId') funnelId: string,
  ): Promise<FunnelDetailInfo> {
    return this.funnelsService.findOne(orgId, projectId, user.id, funnelId);
  }

  @Patch(':funnelId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('funnelId') funnelId: string,
    @Body({ schema: updateFunnelSchema }) dto: UpdateFunnelDto,
  ): Promise<FunnelDetailInfo> {
    return this.funnelsService.update(orgId, projectId, user.id, funnelId, dto);
  }

  @Delete(':funnelId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('funnelId') funnelId: string,
  ): Promise<void> {
    return this.funnelsService.remove(orgId, projectId, user.id, funnelId);
  }
}
