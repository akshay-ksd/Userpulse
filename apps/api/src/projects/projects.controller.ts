import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthUser } from '../auth/auth-user.js';
import {
  createProjectSchema,
  type CreateProjectDto,
} from './create-project.dto.js';
import {
  updateProjectSchema,
  type UpdateProjectDto,
} from './update-project.dto.js';
import { ProjectsService, type ProjectInfo } from './projects.service.js';

@Controller('organizations/:orgId/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Body({ schema: createProjectSchema }) dto: CreateProjectDto,
  ): Promise<ProjectInfo> {
    return this.projectsService.create(orgId, user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
  ): Promise<ProjectInfo[]> {
    return this.projectsService.findByOrganization(orgId, user.id);
  }

  @Get(':projectId')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
  ): Promise<ProjectInfo> {
    return this.projectsService.findOne(orgId, projectId, user.id);
  }

  @Patch(':projectId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('projectId') projectId: string,
    @Body({ schema: updateProjectSchema }) dto: UpdateProjectDto,
  ): Promise<ProjectInfo> {
    return this.projectsService.update(orgId, projectId, user.id, dto);
  }
}
