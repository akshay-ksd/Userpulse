import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateOrganizationDto } from './create-organization.dto.js';
import { appendSuffix, generateSlug } from './slug.js';

export interface OrganizationWithRole {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  role: string;
}

export interface MemberInfo {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
}

const MAX_SLUG_RETRIES = 3;

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateOrganizationDto,
  ): Promise<OrganizationWithRole> {
    let slug = generateSlug(dto.name);
    if (!slug) {
      slug = appendSuffix('org');
    }

    for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt++) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const org = await tx.organization.create({
            data: { name: dto.name, slug },
          });
          const member = await tx.organizationMember.create({
            data: {
              organizationId: org.id,
              userId,
              role: 'OWNER',
            },
          });
          return { org, role: member.role };
        });

        return {
          id: result.org.id,
          name: result.org.name,
          slug: result.org.slug,
          createdAt: result.org.createdAt,
          role: result.role,
        };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < MAX_SLUG_RETRIES
        ) {
          slug = appendSuffix(generateSlug(dto.name) || 'org');
          continue;
        }
        throw error;
      }
    }

    /* istanbul ignore next -- unreachable after the loop */
    throw new Error('Failed to generate a unique slug');
  }

  async findByUser(userId: string): Promise<OrganizationWithRole[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { organization: { createdAt: 'desc' } },
    });

    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      createdAt: m.organization.createdAt,
      role: m.role,
    }));
  }

  async findOneByUser(
    orgId: string,
    userId: string,
  ): Promise<OrganizationWithRole> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
      include: { organization: true },
    });

    if (!membership) {
      throw new NotFoundException();
    }

    return {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      createdAt: membership.organization.createdAt,
      role: membership.role,
    };
  }

  async listMembers(orgId: string, userId: string): Promise<MemberInfo[]> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });

    if (!membership) {
      throw new NotFoundException();
    }

    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      createdAt: m.createdAt,
    }));
  }

  async removeMember(
    orgId: string,
    memberId: string,
    userId: string,
  ): Promise<void> {
    const requesterMembership = await this.prisma.organizationMember.findUnique(
      {
        where: {
          organizationId_userId: { organizationId: orgId, userId },
        },
      },
    );

    if (!requesterMembership || requesterMembership.role !== 'OWNER') {
      throw new ForbiddenException(
        'Only organization owners can remove members.',
      );
    }

    const targetMember = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: orgId },
    });

    if (!targetMember) {
      throw new NotFoundException('Member not found.');
    }

    if (targetMember.role === 'OWNER') {
      const ownerCount = await this.prisma.organizationMember.count({
        where: { organizationId: orgId, role: 'OWNER' },
      });

      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Cannot remove the last owner. Transfer ownership first.',
        );
      }
    }

    await this.prisma.organizationMember.delete({
      where: { id: memberId },
    });
  }
}
