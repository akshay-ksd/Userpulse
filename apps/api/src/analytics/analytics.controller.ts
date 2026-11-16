import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import {
  eventActivityQuerySchema,
  type EventActivityQueryDto,
} from './event-activity-query.dto.js';
import {
  AnalyticsService,
  type EventActivityResult,
} from './analytics.service.js';

@Controller('organizations/:orgId/projects/:projectId/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('event-activity')
  async getEventActivity(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Query() query: Record<string, string>,
  ): Promise<EventActivityResult> {
    const parsed = eventActivityQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    }

    const { startDate, endDate } = parsed.data;
    return this.analyticsService.getEventActivity(
      orgId,
      projectId,
      user.id,
      startDate,
      endDate,
    );
  }
}
