import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import {
  createFeatureSchema,
  type CreateFeatureDto,
} from './create-feature.dto.js';
import {
  updateFeatureSchema,
  type UpdateFeatureDto,
} from './update-feature.dto.js';
import { FeaturesService, type FeatureInfo } from './features.service.js';

@Controller('organizations/:orgId/projects/:projectId/features')
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Body({ schema: createFeatureSchema }) dto: CreateFeatureDto,
  ): Promise<FeatureInfo> {
    return this.featuresService.create(orgId, projectId, user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<FeatureInfo[]> {
    return this.featuresService.findByProject(orgId, projectId, user.id);
  }

  @Patch(':featureId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('featureId') featureId: string,
    @Body({ schema: updateFeatureSchema }) dto: UpdateFeatureDto,
  ): Promise<FeatureInfo> {
    return this.featuresService.update(
      orgId,
      projectId,
      featureId,
      user.id,
      dto,
    );
  }
}
