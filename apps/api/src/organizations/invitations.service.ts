import {
  ConflictException,
  ForbiddenException,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateInvitationDto } from './create-invitation.dto.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface InvitationResult {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AcceptResult {
  organizationId: string;
  organizationName: string;
  role: string;
}

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createInvitation(
    orgId: string,
    inviterUserId: string,
    dto: CreateInvitationDto,
  ): Promise<InvitationResult> {
    // Verify inviter is an OWNER
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: inviterUserId },
      },
    });

    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException(
        'Only organization owners can send invitations.',
      );
    }

    // Check if email is already a member
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      const existingMembership =
        await this.prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: existingUser.id,
            },
          },
        });

      if (existingMembership) {
        throw new ConflictException(
          'This user is already a member of the organization.',
        );
      }
    }

    // Check for existing PENDING, non-expired invitation
    const existingInvitation =
      await this.prisma.organizationInvitation.findFirst({
        where: {
          organizationId: orgId,
          email: dto.email,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
      });

    if (existingInvitation) {
      throw new ConflictException(
        'An active invitation already exists for this email address.',
      );
    }

    // Generate token
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId: orgId,
        email: dto.email,
        role: dto.role,
        tokenHash,
        invitedById: inviterUserId,
        expiresAt,
      },
    });

    // Log invitation URL (email delivery deferred)
    console.log(
      `[Invitation] Accept URL: http://localhost:3000/invitations/accept?token=${rawToken}`,
    );

    return {
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  async acceptInvitation(
    token: string,
    userId: string,
    userEmail: string,
  ): Promise<AcceptResult> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash },
      include: { organization: true },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid invitation token.');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(
        'This invitation has already been used or cancelled.',
      );
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired.');
    }

    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address.',
      );
    }

    // Check if already a member (race condition guard)
    const existingMembership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId,
        },
      },
    });

    if (existingMembership) {
      // Mark invitation as accepted anyway
      await this.prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });

      return {
        organizationId: invitation.organizationId,
        organizationName: invitation.organization.name,
        role: existingMembership.role,
      };
    }

    // Transaction: accept invitation + create membership
    await this.prisma.$transaction([
      this.prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      }),
      this.prisma.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
        },
      }),
    ]);

    return {
      organizationId: invitation.organizationId,
      organizationName: invitation.organization.name,
      role: invitation.role,
    };
  }

  async listInvitations(
    orgId: string,
    userId: string,
  ): Promise<InvitationResult[]> {
    // Verify user is an OWNER
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });

    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException(
        'Only organization owners can view invitations.',
      );
    }

    const invitations = await this.prisma.organizationInvitation.findMany({
      where: {
        organizationId: orgId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      organizationId: inv.organizationId,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  async cancelInvitation(
    orgId: string,
    invitationId: string,
    userId: string,
  ): Promise<void> {
    // Verify user is an OWNER
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });

    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException(
        'Only organization owners can cancel invitations.',
      );
    }

    const invitation = await this.prisma.organizationInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId: orgId,
        status: 'PENDING',
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or already processed.');
    }

    await this.prisma.organizationInvitation.update({
      where: { id: invitationId },
      data: { status: 'CANCELLED' },
    });
  }
}
