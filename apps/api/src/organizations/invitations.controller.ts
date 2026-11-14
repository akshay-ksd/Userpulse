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
  createInvitationSchema,
  type CreateInvitationDto,
} from './create-invitation.dto.js';
import {
  acceptInvitationSchema,
  type AcceptInvitationDto,
} from './accept-invitation.dto.js';
import {
  InvitationsService,
  type InvitationResult,
  type AcceptResult,
} from './invitations.service.js';

@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('organizations/:orgId/invitations')
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Body({ schema: createInvitationSchema }) dto: CreateInvitationDto,
  ): Promise<InvitationResult> {
    return this.invitationsService.createInvitation(orgId, user.id, dto);
  }

  @Get('organizations/:orgId/invitations')
  list(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
  ): Promise<InvitationResult[]> {
    return this.invitationsService.listInvitations(orgId, user.id);
  }

  @Delete('organizations/:orgId/invitations/:invitationId')
  @HttpCode(204)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('orgId') orgId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    return this.invitationsService.cancelInvitation(
      orgId,
      invitationId,
      user.id,
    );
  }

  @Post('invitations/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Body({ schema: acceptInvitationSchema }) dto: AcceptInvitationDto,
  ): Promise<AcceptResult> {
    return this.invitationsService.acceptInvitation(
      dto.token,
      user.id,
      user.email,
    );
  }
}
