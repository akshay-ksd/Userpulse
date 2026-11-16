import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';

export interface DailyCount {
  date: string;
  count: number;
}

export interface EventActivityResult {
  total: number;
  daily: DailyCount[];
  startDate: string;
  endDate: string;
}

export interface ActiveUsersResult {
  total: number;
  daily: DailyCount[];
  startDate: string;
  endDate: string;
  definition: string;
}

const ACTIVE_USER_DEFINITION =
  'An active user is a distinct identified (userId) or anonymous (anonymousId) reference that generated at least one valid event during the selected period.';

const FEATURE_USAGE_COMPARISON_METRIC =
  'Total valid events per feature during the selected period. Features are ranked by event count descending.';

const FEATURE_ADOPTION_DEFINITION =
  'Feature adoption rate is the percentage of active users who used the feature during the selected period. An active user is a distinct identified (userId) or anonymous (anonymousId) reference with at least one valid event.';

export interface FeatureAdoptionEntry {
  featureId: string;
  featureName: string;
  adoptionRate: number;
  featureUsers: number;
  totalUsers: number;
}

export interface FeatureAdoptionResult {
  features: FeatureAdoptionEntry[];
  totalActiveUsers: number;
  startDate: string;
  endDate: string;
  definition: string;
}

export interface FeatureUsageTrendsResult {
  featureId: string;
  featureName: string;
  total: number;
  daily: DailyCount[];
  startDate: string;
  endDate: string;
}

export interface FeatureUsageComparisonEntry {
  featureId: string;
  featureName: string;
  totalEvents: number;
}

export interface FeatureUsageComparisonResult {
  features: FeatureUsageComparisonEntry[];
  startDate: string;
  endDate: string;
  metric: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEventActivity(
    orgId: string,
    projectId: string,
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<EventActivityResult> {
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

    const startDateTime = new Date(`${startDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${endDate}T23:59:59.999Z`);

    const total = await this.prisma.event.count({
      where: {
        projectId,
        validationStatus: 'VALID',
        eventTimestamp: {
          gte: startDateTime,
          lte: endDateTime,
        },
      },
    });

    const dailyRows = await this.prisma.$queryRaw<
      Array<{ day: Date; count: bigint }>
    >`
      SELECT DATE("event_timestamp") AS day, COUNT(*)::bigint AS count
      FROM events
      WHERE "project_id" = ${projectId}
        AND "validation_status" = 'VALID'
        AND "event_timestamp" >= ${startDateTime}
        AND "event_timestamp" <= ${endDateTime}
      GROUP BY DATE("event_timestamp")
      ORDER BY day
    `;

    const dailyMap = new Map<string, number>();
    for (const row of dailyRows) {
      const dateStr = new Date(row.day).toISOString().slice(0, 10);
      dailyMap.set(dateStr, Number(row.count));
    }

    const daily: DailyCount[] = [];
    const cursor = new Date(startDateTime);
    const end = new Date(endDateTime);
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      daily.push({ date: dateStr, count: dailyMap.get(dateStr) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return { total, daily, startDate, endDate };
  }

  async getActiveUsers(
    orgId: string,
    projectId: string,
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<ActiveUsersResult> {
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

    const startDateTime = new Date(`${startDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${endDate}T23:59:59.999Z`);

    const totalRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT COALESCE("user_id", "anonymous_id"))::bigint AS count
      FROM events
      WHERE "project_id" = ${projectId}
        AND "validation_status" = 'VALID'
        AND "event_timestamp" >= ${startDateTime}
        AND "event_timestamp" <= ${endDateTime}
        AND ("user_id" IS NOT NULL OR "anonymous_id" IS NOT NULL)
    `;

    const total = Number(totalRows[0]?.count ?? 0);

    const dailyRows = await this.prisma.$queryRaw<
      Array<{ day: Date; count: bigint }>
    >`
      SELECT DATE("event_timestamp") AS day,
             COUNT(DISTINCT COALESCE("user_id", "anonymous_id"))::bigint AS count
      FROM events
      WHERE "project_id" = ${projectId}
        AND "validation_status" = 'VALID'
        AND "event_timestamp" >= ${startDateTime}
        AND "event_timestamp" <= ${endDateTime}
        AND ("user_id" IS NOT NULL OR "anonymous_id" IS NOT NULL)
      GROUP BY DATE("event_timestamp")
      ORDER BY day
    `;

    const dailyMap = new Map<string, number>();
    for (const row of dailyRows) {
      const dateStr = new Date(row.day).toISOString().slice(0, 10);
      dailyMap.set(dateStr, Number(row.count));
    }

    const daily: DailyCount[] = [];
    const cursor = new Date(startDateTime);
    const end = new Date(endDateTime);
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      daily.push({ date: dateStr, count: dailyMap.get(dateStr) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return {
      total,
      daily,
      startDate,
      endDate,
      definition: ACTIVE_USER_DEFINITION,
    };
  }

  async getFeatureAdoption(
    orgId: string,
    projectId: string,
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<FeatureAdoptionResult> {
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

    const startDateTime = new Date(`${startDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${endDate}T23:59:59.999Z`);

    const totalRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT COALESCE("user_id", "anonymous_id"))::bigint AS count
      FROM events
      WHERE "project_id" = ${projectId}
        AND "validation_status" = 'VALID'
        AND "event_timestamp" >= ${startDateTime}
        AND "event_timestamp" <= ${endDateTime}
        AND ("user_id" IS NOT NULL OR "anonymous_id" IS NOT NULL)
    `;

    const totalActiveUsers = Number(totalRows[0]?.count ?? 0);

    const featureUserRows = await this.prisma.$queryRaw<
      Array<{ feature_id: string; count: bigint }>
    >`
      SELECT fem."feature_id" AS feature_id,
             COUNT(DISTINCT COALESCE(e."user_id", e."anonymous_id"))::bigint AS count
      FROM events e
      INNER JOIN feature_event_mappings fem
        ON e."project_id" = fem."project_id" AND e."event_name" = fem."event_name"
      WHERE e."project_id" = ${projectId}
        AND e."validation_status" = 'VALID'
        AND e."event_timestamp" >= ${startDateTime}
        AND e."event_timestamp" <= ${endDateTime}
        AND (e."user_id" IS NOT NULL OR e."anonymous_id" IS NOT NULL)
      GROUP BY fem."feature_id"
    `;

    const featureUserMap = new Map<string, number>();
    for (const row of featureUserRows) {
      featureUserMap.set(row.feature_id, Number(row.count));
    }

    const activeFeatures = await this.prisma.feature.findMany({
      where: { projectId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    const features: FeatureAdoptionEntry[] = activeFeatures.map((f) => {
      const featureUsers = featureUserMap.get(f.id) ?? 0;
      const adoptionRate =
        totalActiveUsers > 0
          ? Math.round((featureUsers / totalActiveUsers) * 1000) / 10
          : 0;
      return {
        featureId: f.id,
        featureName: f.name,
        adoptionRate,
        featureUsers,
        totalUsers: totalActiveUsers,
      };
    });

    features.sort((a, b) => b.adoptionRate - a.adoptionRate);

    return {
      features,
      totalActiveUsers,
      startDate,
      endDate,
      definition: FEATURE_ADOPTION_DEFINITION,
    };
  }

  async getFeatureUsageTrends(
    orgId: string,
    projectId: string,
    userId: string,
    featureId: string,
    startDate: string,
    endDate: string,
  ): Promise<FeatureUsageTrendsResult> {
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

    const feature = await this.prisma.feature.findFirst({
      where: { id: featureId, projectId, status: 'ACTIVE' },
    });

    if (!feature) {
      throw new NotFoundException();
    }

    const mappings = await this.prisma.featureEventMapping.findMany({
      where: { featureId, projectId },
    });

    const startDateTime = new Date(`${startDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${endDate}T23:59:59.999Z`);

    let total = 0;
    const dailyMap = new Map<string, number>();

    if (mappings.length > 0) {
      const eventNames = mappings.map((m) => m.eventName);

      const totalRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM events
        WHERE "project_id" = ${projectId}
          AND "validation_status" = 'VALID'
          AND "event_name" IN (${Prisma.join(eventNames)})
          AND "event_timestamp" >= ${startDateTime}
          AND "event_timestamp" <= ${endDateTime}
      `;

      total = Number(totalRows[0]?.count ?? 0);

      const dailyRows = await this.prisma.$queryRaw<
        Array<{ day: Date; count: bigint }>
      >`
        SELECT DATE("event_timestamp") AS day, COUNT(*)::bigint AS count
        FROM events
        WHERE "project_id" = ${projectId}
          AND "validation_status" = 'VALID'
          AND "event_name" IN (${Prisma.join(eventNames)})
          AND "event_timestamp" >= ${startDateTime}
          AND "event_timestamp" <= ${endDateTime}
        GROUP BY DATE("event_timestamp")
        ORDER BY day
      `;

      for (const row of dailyRows) {
        const dateStr = new Date(row.day).toISOString().slice(0, 10);
        dailyMap.set(dateStr, Number(row.count));
      }
    }

    const daily: DailyCount[] = [];
    const cursor = new Date(startDateTime);
    const end = new Date(endDateTime);
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      daily.push({ date: dateStr, count: dailyMap.get(dateStr) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return {
      featureId: feature.id,
      featureName: feature.name,
      total,
      daily,
      startDate,
      endDate,
    };
  }

  async getFeatureUsageComparison(
    orgId: string,
    projectId: string,
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<FeatureUsageComparisonResult> {
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

    const startDateTime = new Date(`${startDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${endDate}T23:59:59.999Z`);

    const featureEventRows = await this.prisma.$queryRaw<
      Array<{ feature_id: string; count: bigint }>
    >`
      SELECT fem."feature_id" AS feature_id,
             COUNT(*)::bigint AS count
      FROM events e
      INNER JOIN feature_event_mappings fem
        ON e."project_id" = fem."project_id" AND e."event_name" = fem."event_name"
      WHERE e."project_id" = ${projectId}
        AND e."validation_status" = 'VALID'
        AND e."event_timestamp" >= ${startDateTime}
        AND e."event_timestamp" <= ${endDateTime}
      GROUP BY fem."feature_id"
    `;

    const featureEventMap = new Map<string, number>();
    for (const row of featureEventRows) {
      featureEventMap.set(row.feature_id, Number(row.count));
    }

    const activeFeatures = await this.prisma.feature.findMany({
      where: { projectId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    const features: FeatureUsageComparisonEntry[] = activeFeatures.map((f) => ({
      featureId: f.id,
      featureName: f.name,
      totalEvents: featureEventMap.get(f.id) ?? 0,
    }));

    features.sort((a, b) => b.totalEvents - a.totalEvents);

    return {
      features,
      startDate,
      endDate,
      metric: FEATURE_USAGE_COMPARISON_METRIC,
    };
  }
}
