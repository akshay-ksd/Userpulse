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
  createOrganizationSchema,
  type CreateOrganizationDto,
} from './create-organization.dto.js';
import {
  OrganizationsService,
  type MemberInfo,
  type OrganizationWithRole,
} from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createOrganizationSchema }) dto: CreateOrganizationDto,
  ): Promise<OrganizationWithRole> {
    return this.organizationsService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<OrganizationWithRole[]> {
    return this.organizationsService.findByUser(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<OrganizationWithRole> {
    return this.organizationsService.findOneByUser(id, user.id);
  }

  @Get(':id/members')
  listMembers(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<MemberInfo[]> {
    return this.organizationsService.listMembers(id, user.id);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    return this.organizationsService.removeMember(id, memberId, user.id);
  }
}
