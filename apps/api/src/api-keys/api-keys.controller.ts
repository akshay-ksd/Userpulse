import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import {
  createApiKeySchema,
  type CreateApiKeyDto,
} from './create-api-key.dto.js';
import {
  ApiKeysService,
  type ApiKeyCreated,
  type ApiKeyInfo,
} from './api-keys.service.js';

@Controller('organizations/:orgId/projects/:projectId/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Body({ schema: createApiKeySchema }) dto: CreateApiKeyDto,
  ): Promise<ApiKeyCreated> {
    return this.apiKeysService.create(orgId, projectId, user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<ApiKeyInfo[]> {
    return this.apiKeysService.findByProject(orgId, projectId, user.id);
  }

  @Delete(':keyId')
  @HttpCode(204)
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('keyId') keyId: string,
  ): Promise<void> {
    return this.apiKeysService
      .revoke(orgId, projectId, keyId, user.id)
      .then(() => undefined);
  }

  @Post(':keyId/rotate')
  @HttpCode(201)
  rotate(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Param('keyId') keyId: string,
    @Body({ schema: createApiKeySchema }) dto: CreateApiKeyDto,
  ): Promise<ApiKeyCreated> {
    return this.apiKeysService.rotate(orgId, projectId, keyId, user.id, dto);
  }
}
