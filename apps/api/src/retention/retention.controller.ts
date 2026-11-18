import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import {
  updateRetentionSchema,
  type UpdateRetentionDto,
} from './dto/update-retention.dto.js';
import {
  RetentionService,
  type RetentionSettings,
} from './retention.service.js';

@Controller('organizations/:orgId/retention')
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Get()
  getRetentionSettings(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
  ): Promise<RetentionSettings> {
    return this.retentionService.getRetentionSettings(orgId, user.id);
  }

  @Patch()
  updateRetentionSettings(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Body({ schema: updateRetentionSchema }) dto: UpdateRetentionDto,
  ): Promise<RetentionSettings> {
    return this.retentionService.updateRetentionSettings(
      orgId,
      user.id,
      dto.eventRetentionDays,
    );
  }
}
