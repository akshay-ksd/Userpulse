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

const USER_JOURNEY_IDENTITY_RULE =
  'A user is identified by userId when available, otherwise anonymousId (COALESCE). Each unique identity is counted once per sequence.';

const USER_JOURNEY_SESSION_RULE =
  'No session windowing is applied. Events are ordered by timestamp across the full date range per user identity.';

const FEATURE_USAGE_INSIGHTS_METHOD =
  'Features are classified by comparing their total event count to the mean across all features with data. High usage: > 2× mean. Low usage: < 0.25× mean. Features with zero events are labeled as insufficient data.';

const ACTIVITY_CHANGES_METHOD =
  'Activity in the selected period is compared against the equal-length preceding period. A change is significant if the absolute percentage change exceeds 30% and the combined event volume (current + baseline) is at least 10. Low-volume events (combined < 10) are flagged but not classified as significant. No causal claims are made.';

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

export interface FeatureUsageInsight {
  featureId: string;
  featureName: string;
  totalEvents: number;
  classification: 'high' | 'low' | 'normal';
  insufficientData: boolean;
}

export interface FeatureUsageInsightsResult {
  insights: FeatureUsageInsight[];
  meanEvents: number;
  highThreshold: number;
  lowThreshold: number;
  totalFeatures: number;
  featuresWithData: number;
  startDate: string;
  endDate: string;
  method: string;
  insufficientData: boolean;
  insufficientDataReason?: string;
}

export interface ActivityChangeEntry {
  eventName: string;
  currentCount: number;
  baselineCount: number;
  direction: 'increase' | 'decrease' | 'unchanged';
  percentChange: number;
  lowVolume: boolean;
}

export interface ActivityChangesResult {
  overall: {
    currentTotal: number;
    baselineTotal: number;
    direction: 'increase' | 'decrease' | 'unchanged';
    percentChange: number;
  };
  changes: ActivityChangeEntry[];
  significantChanges: ActivityChangeEntry[];
  currentPeriod: { startDate: string; endDate: string };
  baselinePeriod: { startDate: string; endDate: string };
  method: string;
  insufficientData: boolean;
  insufficientDataReason?: string;
}

export interface UserJourneySequence {
  sequence: string[];
  userCount: number;
  lowVolume: boolean;
}

export interface UserJourneysResult {
  sequences: UserJourneySequence[];
  totalUsers: number;
  startDate: string;
  endDate: string;
  maxSteps: number;
  minUsers: number;
  identityRule: string;
  sessionRule: string;
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
      SELECT DATE("eventTimestamp") AS day, COUNT(*)::bigint AS count
      FROM events
      WHERE "projectId" = ${projectId}
        AND "validationStatus" = 'VALID'
        AND "eventTimestamp" >= ${startDateTime}
        AND "eventTimestamp" <= ${endDateTime}
      GROUP BY DATE("eventTimestamp")
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
      SELECT COUNT(DISTINCT COALESCE("userId", "anonymousId"))::bigint AS count
      FROM events
      WHERE "projectId" = ${projectId}
        AND "validationStatus" = 'VALID'
        AND "eventTimestamp" >= ${startDateTime}
        AND "eventTimestamp" <= ${endDateTime}
        AND ("userId" IS NOT NULL OR "anonymousId" IS NOT NULL)
    `;

    const total = Number(totalRows[0]?.count ?? 0);

    const dailyRows = await this.prisma.$queryRaw<
      Array<{ day: Date; count: bigint }>
    >`
      SELECT DATE("eventTimestamp") AS day,
             COUNT(DISTINCT COALESCE("userId", "anonymousId"))::bigint AS count
      FROM events
      WHERE "projectId" = ${projectId}
        AND "validationStatus" = 'VALID'
        AND "eventTimestamp" >= ${startDateTime}
        AND "eventTimestamp" <= ${endDateTime}
        AND ("userId" IS NOT NULL OR "anonymousId" IS NOT NULL)
      GROUP BY DATE("eventTimestamp")
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
      SELECT COUNT(DISTINCT COALESCE("userId", "anonymousId"))::bigint AS count
      FROM events
      WHERE "projectId" = ${projectId}
        AND "validationStatus" = 'VALID'
        AND "eventTimestamp" >= ${startDateTime}
        AND "eventTimestamp" <= ${endDateTime}
        AND ("userId" IS NOT NULL OR "anonymousId" IS NOT NULL)
    `;

    const totalActiveUsers = Number(totalRows[0]?.count ?? 0);

    const featureUserRows = await this.prisma.$queryRaw<
      Array<{ featureId: string; count: bigint }>
    >`
      SELECT fem."featureId" AS "featureId",
             COUNT(DISTINCT COALESCE(e."userId", e."anonymousId"))::bigint AS count
      FROM events e
      INNER JOIN feature_event_mappings fem
        ON e."projectId" = fem."projectId" AND e."eventName" = fem."eventName"
      WHERE e."projectId" = ${projectId}
        AND e."validationStatus" = 'VALID'
        AND e."eventTimestamp" >= ${startDateTime}
        AND e."eventTimestamp" <= ${endDateTime}
        AND (e."userId" IS NOT NULL OR e."anonymousId" IS NOT NULL)
      GROUP BY fem."featureId"
    `;

    const featureUserMap = new Map<string, number>();
    for (const row of featureUserRows) {
      featureUserMap.set(row.featureId, Number(row.count));
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
        WHERE "projectId" = ${projectId}
          AND "validationStatus" = 'VALID'
          AND "eventName" IN (${Prisma.join(eventNames)})
          AND "eventTimestamp" >= ${startDateTime}
          AND "eventTimestamp" <= ${endDateTime}
      `;

      total = Number(totalRows[0]?.count ?? 0);

      const dailyRows = await this.prisma.$queryRaw<
        Array<{ day: Date; count: bigint }>
      >`
        SELECT DATE("eventTimestamp") AS day, COUNT(*)::bigint AS count
        FROM events
        WHERE "projectId" = ${projectId}
          AND "validationStatus" = 'VALID'
          AND "eventName" IN (${Prisma.join(eventNames)})
          AND "eventTimestamp" >= ${startDateTime}
          AND "eventTimestamp" <= ${endDateTime}
        GROUP BY DATE("eventTimestamp")
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
      Array<{ featureId: string; count: bigint }>
    >`
      SELECT fem."featureId" AS "featureId",
             COUNT(*)::bigint AS count
      FROM events e
      INNER JOIN feature_event_mappings fem
        ON e."projectId" = fem."projectId" AND e."eventName" = fem."eventName"
      WHERE e."projectId" = ${projectId}
        AND e."validationStatus" = 'VALID'
        AND e."eventTimestamp" >= ${startDateTime}
        AND e."eventTimestamp" <= ${endDateTime}
      GROUP BY fem."featureId"
    `;

    const featureEventMap = new Map<string, number>();
    for (const row of featureEventRows) {
      featureEventMap.set(row.featureId, Number(row.count));
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

  async getUserJourneys(
    orgId: string,
    projectId: string,
    userId: string,
    startDate: string,
    endDate: string,
    maxSteps: number,
    minUsers: number,
    limit: number,
  ): Promise<UserJourneysResult> {
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
      SELECT COUNT(DISTINCT COALESCE("userId", "anonymousId"))::bigint AS count
      FROM events
      WHERE "projectId" = ${projectId}
        AND "validationStatus" = 'VALID'
        AND "eventTimestamp" >= ${startDateTime}
        AND "eventTimestamp" <= ${endDateTime}
        AND ("userId" IS NOT NULL OR "anonymousId" IS NOT NULL)
    `;

    const totalUsers = Number(totalRows[0]?.count ?? 0);

    if (totalUsers === 0) {
      return {
        sequences: [],
        totalUsers: 0,
        startDate,
        endDate,
        maxSteps,
        minUsers,
        identityRule: USER_JOURNEY_IDENTITY_RULE,
        sessionRule: USER_JOURNEY_SESSION_RULE,
      };
    }

    const sequenceRows = await this.prisma.$queryRawUnsafe<
      Array<{ sequence: string[]; user_count: bigint }>
    >(
      `
      WITH user_events AS (
        SELECT
          COALESCE("userId", "anonymousId") AS uid,
          "eventName",
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE("userId", "anonymousId")
            ORDER BY "eventTimestamp", "ingestedAt"
          ) AS rn
        FROM events
        WHERE "projectId" = $1
          AND "validationStatus" = 'VALID'
          AND "eventTimestamp" >= $2
          AND "eventTimestamp" <= $3
          AND ("userId" IS NOT NULL OR "anonymousId" IS NOT NULL)
      ),
      sequences AS (
        SELECT
          e1.uid,
          ARRAY[${Array.from({ length: maxSteps }, (_, i) => `e${i + 1}."eventName"`).join(', ')}] AS seq
        FROM user_events e1
        ${Array.from({ length: maxSteps - 1 }, (_, i) => {
          const idx = i + 2;
          return `INNER JOIN user_events e${idx} ON e1.uid = e${idx}.uid AND e${idx}.rn = e1.rn + ${i + 1}`;
        }).join('\n        ')}
      )
      SELECT seq AS sequence, COUNT(DISTINCT uid)::bigint AS user_count
      FROM sequences
      GROUP BY seq
      HAVING COUNT(DISTINCT uid) >= $4
      ORDER BY user_count DESC
      LIMIT $5
      `,
      projectId,
      startDateTime,
      endDateTime,
      minUsers,
      limit,
    );

    const lowVolumeThreshold = Math.ceil(totalUsers * 0.05);

    const sequences: UserJourneySequence[] = sequenceRows.map((row) => ({
      sequence: row.sequence,
      userCount: Number(row.user_count),
      lowVolume: Number(row.user_count) < lowVolumeThreshold,
    }));

    return {
      sequences,
      totalUsers,
      startDate,
      endDate,
      maxSteps,
      minUsers,
      identityRule: USER_JOURNEY_IDENTITY_RULE,
      sessionRule: USER_JOURNEY_SESSION_RULE,
    };
  }

  async getFeatureUsageInsights(
    orgId: string,
    projectId: string,
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<FeatureUsageInsightsResult> {
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
      Array<{ featureId: string; count: bigint }>
    >`
      SELECT fem."featureId" AS "featureId",
             COUNT(*)::bigint AS count
      FROM events e
      INNER JOIN feature_event_mappings fem
        ON e."projectId" = fem."projectId" AND e."eventName" = fem."eventName"
      WHERE e."projectId" = ${projectId}
        AND e."validationStatus" = 'VALID'
        AND e."eventTimestamp" >= ${startDateTime}
        AND e."eventTimestamp" <= ${endDateTime}
      GROUP BY fem."featureId"
    `;

    const featureEventMap = new Map<string, number>();
    for (const row of featureEventRows) {
      featureEventMap.set(row.featureId, Number(row.count));
    }

    const activeFeatures = await this.prisma.feature.findMany({
      where: { projectId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    const totalFeatures = activeFeatures.length;
    const featuresWithData = activeFeatures.filter(
      (f) => (featureEventMap.get(f.id) ?? 0) > 0,
    ).length;

    if (featuresWithData < 2) {
      return {
        insights: [],
        meanEvents: 0,
        highThreshold: 0,
        lowThreshold: 0,
        totalFeatures,
        featuresWithData,
        startDate,
        endDate,
        method: FEATURE_USAGE_INSIGHTS_METHOD,
        insufficientData: true,
        insufficientDataReason:
          featuresWithData === 0
            ? 'No features have event data in this period.'
            : 'At least 2 features with event data are needed for comparison.',
      };
    }

    const totalEventsAcrossFeatures = activeFeatures.reduce(
      (sum, f) => sum + (featureEventMap.get(f.id) ?? 0),
      0,
    );
    const meanEvents = totalEventsAcrossFeatures / featuresWithData;
    const highThreshold = meanEvents * 2;
    const lowThreshold = meanEvents * 0.25;

    const insights: FeatureUsageInsight[] = activeFeatures.map((f) => {
      const totalEvents = featureEventMap.get(f.id) ?? 0;
      let classification: 'high' | 'low' | 'normal';
      let insufficientData = false;

      if (totalEvents === 0) {
        classification = 'low';
        insufficientData = true;
      } else if (totalEvents > highThreshold) {
        classification = 'high';
      } else if (totalEvents < lowThreshold) {
        classification = 'low';
      } else {
        classification = 'normal';
      }

      return {
        featureId: f.id,
        featureName: f.name,
        totalEvents,
        classification,
        insufficientData,
      };
    });

    insights.sort((a, b) => b.totalEvents - a.totalEvents);

    return {
      insights,
      meanEvents: Math.round(meanEvents * 10) / 10,
      highThreshold: Math.round(highThreshold * 10) / 10,
      lowThreshold: Math.round(lowThreshold * 10) / 10,
      totalFeatures,
      featuresWithData,
      startDate,
      endDate,
      method: FEATURE_USAGE_INSIGHTS_METHOD,
      insufficientData: false,
    };
  }

  async getActivityChanges(
    orgId: string,
    projectId: string,
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<ActivityChangesResult> {
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

    const currentStart = new Date(`${startDate}T00:00:00.000Z`);
    const currentEnd = new Date(`${endDate}T23:59:59.999Z`);

    const periodMs = currentEnd.getTime() - currentStart.getTime() + 1;
    const baselineEnd = new Date(currentStart.getTime() - 1);
    const baselineStart = new Date(baselineEnd.getTime() - periodMs + 1);

    const baselineStartDate = baselineStart.toISOString().slice(0, 10);
    const baselineEndDate = baselineEnd.toISOString().slice(0, 10);
    const baselineStartDt = new Date(`${baselineStartDate}T00:00:00.000Z`);
    const baselineEndDt = new Date(`${baselineEndDate}T23:59:59.999Z`);

    const [currentEventRows, baselineEventRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ eventName: string; count: bigint }>>`
        SELECT "eventName", COUNT(*)::bigint AS count
        FROM events
        WHERE "projectId" = ${projectId}
          AND "validationStatus" = 'VALID'
          AND "eventTimestamp" >= ${currentStart}
          AND "eventTimestamp" <= ${currentEnd}
        GROUP BY "eventName"
      `,
      this.prisma.$queryRaw<Array<{ eventName: string; count: bigint }>>`
        SELECT "eventName", COUNT(*)::bigint AS count
        FROM events
        WHERE "projectId" = ${projectId}
          AND "validationStatus" = 'VALID'
          AND "eventTimestamp" >= ${baselineStartDt}
          AND "eventTimestamp" <= ${baselineEndDt}
        GROUP BY "eventName"
      `,
    ]);

    const currentMap = new Map<string, number>();
    let currentTotal = 0;
    for (const row of currentEventRows) {
      const c = Number(row.count);
      currentMap.set(row.eventName, c);
      currentTotal += c;
    }

    const baselineMap = new Map<string, number>();
    let baselineTotal = 0;
    for (const row of baselineEventRows) {
      const c = Number(row.count);
      baselineMap.set(row.eventName, c);
      baselineTotal += c;
    }

    const currentPeriod = { startDate, endDate };
    const baselinePeriod = {
      startDate: baselineStartDate,
      endDate: baselineEndDate,
    };

    if (baselineTotal < 5) {
      const overallDirection = calcDirection(currentTotal, baselineTotal);
      const overallPct = calcPercentChange(currentTotal, baselineTotal);
      return {
        overall: {
          currentTotal,
          baselineTotal,
          direction: overallDirection,
          percentChange: overallPct,
        },
        changes: [],
        significantChanges: [],
        currentPeriod,
        baselinePeriod,
        method: ACTIVITY_CHANGES_METHOD,
        insufficientData: true,
        insufficientDataReason:
          'The baseline period has fewer than 5 events, which is too few for a meaningful comparison.',
      };
    }

    const allEventNames = new Set([
      ...currentMap.keys(),
      ...baselineMap.keys(),
    ]);

    const changes: ActivityChangeEntry[] = [];
    for (const eventName of allEventNames) {
      const curr = currentMap.get(eventName) ?? 0;
      const base = baselineMap.get(eventName) ?? 0;
      const combined = curr + base;
      const lowVolume = combined < 10;
      const direction = calcDirection(curr, base);
      const percentChange = calcPercentChange(curr, base);

      changes.push({
        eventName,
        currentCount: curr,
        baselineCount: base,
        direction,
        percentChange,
        lowVolume,
      });
    }

    changes.sort(
      (a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange),
    );

    const significantChanges = changes.filter(
      (c) => !c.lowVolume && Math.abs(c.percentChange) > 30,
    );

    const overallDirection = calcDirection(currentTotal, baselineTotal);
    const overallPct = calcPercentChange(currentTotal, baselineTotal);

    return {
      overall: {
        currentTotal,
        baselineTotal,
        direction: overallDirection,
        percentChange: overallPct,
      },
      changes,
      significantChanges,
      currentPeriod,
      baselinePeriod,
      method: ACTIVITY_CHANGES_METHOD,
      insufficientData: false,
    };
  }
}

function calcDirection(
  current: number,
  baseline: number,
): 'increase' | 'decrease' | 'unchanged' {
  if (current > baseline) return 'increase';
  if (current < baseline) return 'decrease';
  return 'unchanged';
}

function calcPercentChange(current: number, baseline: number): number {
  if (baseline === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}
