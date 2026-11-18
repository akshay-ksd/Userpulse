import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import { FeaturesService, type UnmappedEventInfo } from './features.service.js';

@Controller('organizations/:orgId/projects/:projectId/unmapped-events')
export class UnmappedEventsController {
  constructor(private readonly featuresService: FeaturesService) {}

  @Get()
  getUnmappedEvents(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<UnmappedEventInfo[]> {
    return this.featuresService.getUnmappedEvents(orgId, projectId, user.id);
  }
}
