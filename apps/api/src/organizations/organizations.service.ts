import { Injectable, NotFoundException } from '@nestjs/common';
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
}
