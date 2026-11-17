import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateFunnelDto } from './create-funnel.dto.js';
import type { UpdateFunnelDto } from './update-funnel.dto.js';

export interface FunnelStepInfo {
  id: string;
  stepOrder: number;
  eventName: string;
}

export interface FunnelInfo {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  stepCount: number;
}

export interface FunnelDetailInfo {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  steps: FunnelStepInfo[];
}

export interface FunnelStepAnalytics {
  stepOrder: number;
  eventName: string;
  users: number;
  conversionRate: number;
  dropOff: number;
  dropOffRate: number;
}

export interface FunnelAnalyticsResult {
  funnelId: string;
  funnelName: string;
  steps: FunnelStepAnalytics[];
  totalEnteredUsers: number;
  totalConvertedUsers: number;
  overallConversionRate: number;
  startDate: string;
  endDate: string;
  identityRule: string;
  orderingRule: string;
  conversionWindow: string;
  disclaimer: string;
}

const IDENTITY_RULE =
  'A user is identified by userId when available, otherwise anonymousId (COALESCE).';
const ORDERING_RULE =
  'Events must occur in step order by timestamp. A user reaches step N only after completing step N-1.';
const CONVERSION_WINDOW = 'Full date range (no separate conversion window).';
const DISCLAIMER =
  'Drop-off indicates where users did not complete the next step. It does not imply a specific cause.';

@Injectable()
export class FunnelsService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyProjectAccess(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });

    if (!membership) {
      throw new NotFoundException();
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });

    if (!project) {
      throw new NotFoundException();
    }
  }

  async create(
    orgId: string,
    projectId: string,
    userId: string,
    dto: CreateFunnelDto,
  ): Promise<FunnelDetailInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const funnel = await this.prisma.$transaction(async (tx) => {
      const created = await tx.funnel.create({
        data: {
          projectId,
          name: dto.name,
        },
      });

      await tx.funnelStep.createMany({
        data: dto.steps.map((step, index) => ({
          funnelId: created.id,
          stepOrder: index,
          eventName: step.eventName,
        })),
      });

      return tx.funnel.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          steps: { orderBy: { stepOrder: 'asc' } },
        },
      });
    });

    return this.toDetailInfo(funnel);
  }

  async findByProject(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<FunnelInfo[]> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const funnels = await this.prisma.funnel.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { steps: true } } },
    });

    return funnels.map((f) => ({
      id: f.id,
      projectId: f.projectId,
      name: f.name,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      stepCount: f._count.steps,
    }));
  }

  async findOne(
    orgId: string,
    projectId: string,
    userId: string,
    funnelId: string,
  ): Promise<FunnelDetailInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const funnel = await this.prisma.funnel.findFirst({
      where: { id: funnelId, projectId },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });

    if (!funnel) {
      throw new NotFoundException();
    }

    return this.toDetailInfo(funnel);
  }

  async update(
    orgId: string,
    projectId: string,
    userId: string,
    funnelId: string,
    dto: UpdateFunnelDto,
  ): Promise<FunnelDetailInfo> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const existing = await this.prisma.funnel.findFirst({
      where: { id: funnelId, projectId },
    });

    if (!existing) {
      throw new NotFoundException();
    }

    const funnel = await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined) {
        await tx.funnel.update({
          where: { id: funnelId },
          data: { name: dto.name },
        });
      }

      if (dto.steps !== undefined) {
        await tx.funnelStep.deleteMany({
          where: { funnelId },
        });

        await tx.funnelStep.createMany({
          data: dto.steps.map((step, index) => ({
            funnelId,
            stepOrder: index,
            eventName: step.eventName,
          })),
        });
      }

      return tx.funnel.findUniqueOrThrow({
        where: { id: funnelId },
        include: {
          steps: { orderBy: { stepOrder: 'asc' } },
        },
      });
    });

    return this.toDetailInfo(funnel);
  }

  async remove(
    orgId: string,
    projectId: string,
    userId: string,
    funnelId: string,
  ): Promise<void> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const funnel = await this.prisma.funnel.findFirst({
      where: { id: funnelId, projectId },
    });

    if (!funnel) {
      throw new NotFoundException();
    }

    await this.prisma.funnel.delete({
      where: { id: funnelId },
    });
  }

  async getAnalytics(
    orgId: string,
    projectId: string,
    userId: string,
    funnelId: string,
    startDate: string,
    endDate: string,
  ): Promise<FunnelAnalyticsResult> {
    const funnel = await this.findOne(orgId, projectId, userId, funnelId);
    const steps = funnel.steps;

    if (steps.length === 0) {
      return this.buildEmptyResult(funnel, startDate, endDate);
    }

    const startDateTime = new Date(`${startDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${endDate}T23:59:59.999Z`);

    const stepCounts = await this.computeStepCounts(
      projectId,
      steps,
      startDateTime,
      endDateTime,
    );

    const totalEnteredUsers = stepCounts[0] ?? 0;
    const totalConvertedUsers = stepCounts[stepCounts.length - 1] ?? 0;

    const analyticsSteps: FunnelStepAnalytics[] = steps.map((step, i) => {
      const users = stepCounts[i] ?? 0;
      const conversionRate =
        totalEnteredUsers > 0
          ? Math.round((users / totalEnteredUsers) * 1000) / 10
          : 0;
      const prevUsers = i > 0 ? (stepCounts[i - 1] ?? 0) : users;
      const dropOff = i > 0 ? prevUsers - users : 0;
      const dropOffRate =
        i > 0 && prevUsers > 0
          ? Math.round((dropOff / prevUsers) * 1000) / 10
          : 0;

      return {
        stepOrder: step.stepOrder,
        eventName: step.eventName,
        users,
        conversionRate,
        dropOff,
        dropOffRate,
      };
    });

    return {
      funnelId: funnel.id,
      funnelName: funnel.name,
      steps: analyticsSteps,
      totalEnteredUsers,
      totalConvertedUsers,
      overallConversionRate:
        totalEnteredUsers > 0
          ? Math.round((totalConvertedUsers / totalEnteredUsers) * 1000) / 10
          : 0,
      startDate,
      endDate,
      identityRule: IDENTITY_RULE,
      orderingRule: ORDERING_RULE,
      conversionWindow: CONVERSION_WINDOW,
      disclaimer: DISCLAIMER,
    };
  }

  private buildEmptyResult(
    funnel: FunnelDetailInfo,
    startDate: string,
    endDate: string,
  ): FunnelAnalyticsResult {
    return {
      funnelId: funnel.id,
      funnelName: funnel.name,
      steps: [],
      totalEnteredUsers: 0,
      totalConvertedUsers: 0,
      overallConversionRate: 0,
      startDate,
      endDate,
      identityRule: IDENTITY_RULE,
      orderingRule: ORDERING_RULE,
      conversionWindow: CONVERSION_WINDOW,
      disclaimer: DISCLAIMER,
    };
  }

  private async computeStepCounts(
    projectId: string,
    steps: FunnelStepInfo[],
    startDateTime: Date,
    endDateTime: Date,
  ): Promise<number[]> {
    if (steps.length === 0) return [];

    // Build CTE-based query for sequential funnel analysis
    const cteParts: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Step 0: users who performed the first event in the date range
    cteParts.push(`step_0 AS (
      SELECT DISTINCT COALESCE("user_id", "anonymous_id") AS uid,
             MIN("event_timestamp") AS ts
      FROM events
      WHERE "project_id" = $${paramIdx++}
        AND "validation_status" = 'VALID'
        AND "event_name" = $${paramIdx++}
        AND "event_timestamp" >= $${paramIdx++}
        AND "event_timestamp" <= $${paramIdx++}
        AND ("user_id" IS NOT NULL OR "anonymous_id" IS NOT NULL)
      GROUP BY COALESCE("user_id", "anonymous_id")
    )`);
    params.push(projectId, steps[0].eventName, startDateTime, endDateTime);

    // Subsequent steps: users from previous step who performed this event after their previous step timestamp
    for (let i = 1; i < steps.length; i++) {
      cteParts.push(`step_${i} AS (
        SELECT DISTINCT s.uid,
               MIN(e."event_timestamp") AS ts
        FROM step_${i - 1} s
        INNER JOIN events e ON COALESCE(e."user_id", e."anonymous_id") = s.uid
        WHERE e."project_id" = $${paramIdx++}
          AND e."validation_status" = 'VALID'
          AND e."event_name" = $${paramIdx++}
          AND e."event_timestamp" > s.ts
          AND e."event_timestamp" <= $${paramIdx++}
          AND (e."user_id" IS NOT NULL OR e."anonymous_id" IS NOT NULL)
        GROUP BY s.uid
      )`);
      params.push(projectId, steps[i].eventName, endDateTime);
    }

    // Build count selects for each step
    const countSelects = steps
      .map(
        (_, i) => `(SELECT COUNT(*)::bigint FROM step_${i}) AS step_${i}_count`,
      )
      .join(', ');

    const query = `WITH ${cteParts.join(', ')} SELECT ${countSelects}`;

    const rows = await this.prisma.$queryRawUnsafe<
      Array<Record<string, bigint>>
    >(query, ...params);

    const row = rows[0];
    if (!row) return steps.map(() => 0);

    return steps.map((_, i) => Number(row[`step_${i}_count`] ?? 0));
  }

  async getProjectEventNames(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<string[]> {
    await this.verifyProjectAccess(orgId, projectId, userId);

    const groups = await this.prisma.event.groupBy({
      by: ['eventName'],
      where: { projectId, processingStatus: 'PROCESSED' },
    });

    return groups.map((g) => g.eventName).sort();
  }

  private toDetailInfo(funnel: {
    id: string;
    projectId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    steps: { id: string; stepOrder: number; eventName: string }[];
  }): FunnelDetailInfo {
    return {
      id: funnel.id,
      projectId: funnel.projectId,
      name: funnel.name,
      createdAt: funnel.createdAt,
      updatedAt: funnel.updatedAt,
      steps: funnel.steps.map((s) => ({
        id: s.id,
        stepOrder: s.stepOrder,
        eventName: s.eventName,
      })),
    };
  }
}
