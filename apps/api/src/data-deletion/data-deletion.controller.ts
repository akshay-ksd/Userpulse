import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import {
  DataDeletionService,
  type DeletionRequestInfo,
} from './data-deletion.service.js';

@Controller()
export class DataDeletionController {
  constructor(private readonly dataDeletionService: DataDeletionService) {}

  @Post('organizations/:orgId/projects/:projectId/data-deletion')
  @HttpCode(201)
  createRequest(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<DeletionRequestInfo> {
    return this.dataDeletionService.createRequest(orgId, projectId, user.id);
  }

  @Post('organizations/:orgId/data-deletion/:requestId/confirm')
  confirmRequest(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('requestId') requestId: string,
  ): Promise<DeletionRequestInfo> {
    return this.dataDeletionService.confirmRequest(orgId, requestId, user.id);
  }

  @Get('organizations/:orgId/data-deletion')
  listRequests(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
  ): Promise<DeletionRequestInfo[]> {
    return this.dataDeletionService.listRequests(orgId, user.id);
  }

  @Get('organizations/:orgId/data-deletion/:requestId')
  getRequest(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('requestId') requestId: string,
  ): Promise<DeletionRequestInfo> {
    return this.dataDeletionService.getRequest(orgId, requestId, user.id);
  }

  @Delete('organizations/:orgId/data-deletion/:requestId')
  @HttpCode(204)
  cancelRequest(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('requestId') requestId: string,
  ): Promise<void> {
    return this.dataDeletionService.cancelRequest(orgId, requestId, user.id);
  }
}
