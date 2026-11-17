import { Injectable } from '@nestjs/common';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';

export interface FeatureInfo {
  id: string;
  name: string;
  eventNames: string[];
}

export interface FeatureAdoptionEvidence {
  featureId: string;
  featureName: string;
  adoptionRate: number;
  featureUsers: number;
  totalUsers: number;
}

export interface ActivityChangeEvidence {
  eventName: string;
  currentCount: number;
  baselineCount: number;
  direction: 'increase' | 'decrease' | 'unchanged';
  percentChange: number;
  significant: boolean;
}

export interface FeatureUsageEvidence {
  featureId: string;
  featureName: string;
  totalEvents: number;
  classification: 'high' | 'low' | 'normal';
}

export interface TopEventEvidence {
  eventName: string;
  count: number;
}

export interface EvidencePackage {
  project: { id: string; name: string; description: string | null };
  features: FeatureInfo[];
  featureAdoption: FeatureAdoptionEvidence[];
  activityChanges: ActivityChangeEvidence[];
  featureUsage: FeatureUsageEvidence[];
  topEvents: TopEventEvidence[];
  activeUsers: number;
  totalEvents: number;
  period: { start: string; end: string };
}

@Injectable()
export class EvidenceGathererService {
  constructor(private readonly prisma: PrismaService) {}

  async gatherEvidence(
    projectId: string,
    orgId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<EvidencePackage> {
    const project = await this.prisma.project.findFirstOrThrow({
      where: { id: projectId, organizationId: orgId },
    });

    const features = await this.prisma.feature.findMany({
      where: { projectId, status: 'ACTIVE' },
      include: { mappings: true },
    });

    const featureInfos: FeatureInfo[] = features.map((f) => ({
      id: f.id,
      name: f.name,
      eventNames: f.mappings.map((m) => m.eventName),
    }));

    const [
      activeUsersResult,
      totalEventsResult,
      featureAdoption,
      activityChanges,
      featureUsage,
      topEvents,
    ] = await Promise.all([
      this.queryActiveUsers(projectId, periodStart, periodEnd),
      this.queryTotalEvents(projectId, periodStart, periodEnd),
      this.queryFeatureAdoption(projectId, features, periodStart, periodEnd),
      this.queryActivityChanges(projectId, periodStart, periodEnd),
      this.queryFeatureUsage(projectId, features, periodStart, periodEnd),
      this.queryTopEvents(projectId, periodStart, periodEnd),
    ]);

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      features: featureInfos,
      featureAdoption,
      activityChanges,
      featureUsage,
      topEvents,
      activeUsers: activeUsersResult,
      totalEvents: totalEventsResult,
      period: {
        start: periodStart.toISOString().slice(0, 10),
        end: periodEnd.toISOString().slice(0, 10),
      },
    };
  }

  private async queryActiveUsers(
    projectId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT COALESCE("user_id", "anonymous_id"))::bigint AS count
      FROM events
      WHERE "project_id" = ${projectId}
        AND "validation_status" = 'VALID'
        AND "event_timestamp" >= ${periodStart}
        AND "event_timestamp" <= ${periodEnd}
        AND ("user_id" IS NOT NULL OR "anonymous_id" IS NOT NULL)
    `;
    return Number(rows[0]?.count ?? 0);
  }

  private async queryTotalEvents(
    projectId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    return this.prisma.event.count({
      where: {
        projectId,
        validationStatus: 'VALID',
        processingStatus: 'PROCESSED',
        eventTimestamp: { gte: periodStart, lte: periodEnd },
      },
    });
  }

  private async queryFeatureAdoption(
    projectId: string,
    features: Array<{
      id: string;
      name: string;
      mappings: Array<{ eventName: string }>;
    }>,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<FeatureAdoptionEvidence[]> {
    if (features.length === 0) return [];

    const totalRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT COALESCE("user_id", "anonymous_id"))::bigint AS count
      FROM events
      WHERE "project_id" = ${projectId}
        AND "validation_status" = 'VALID'
        AND "event_timestamp" >= ${periodStart}
        AND "event_timestamp" <= ${periodEnd}
        AND ("user_id" IS NOT NULL OR "anonymous_id" IS NOT NULL)
    `;
    const totalUsers = Number(totalRows[0]?.count ?? 0);
    if (totalUsers === 0) {
      return features.map((f) => ({
        featureId: f.id,
        featureName: f.name,
        adoptionRate: 0,
        featureUsers: 0,
        totalUsers: 0,
      }));
    }

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
        AND e."event_timestamp" >= ${periodStart}
        AND e."event_timestamp" <= ${periodEnd}
        AND (e."user_id" IS NOT NULL OR e."anonymous_id" IS NOT NULL)
      GROUP BY fem."feature_id"
    `;

    const featureUserMap = new Map<string, number>();
    for (const row of featureUserRows) {
      featureUserMap.set(row.feature_id, Number(row.count));
    }

    return features.map((f) => {
      const featureUsers = featureUserMap.get(f.id) ?? 0;
      return {
        featureId: f.id,
        featureName: f.name,
        adoptionRate:
          totalUsers > 0
            ? Math.round((featureUsers / totalUsers) * 1000) / 10
            : 0,
        featureUsers,
        totalUsers,
      };
    });
  }

  private async queryActivityChanges(
    projectId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ActivityChangeEvidence[]> {
    const periodMs = periodEnd.getTime() - periodStart.getTime() + 1;
    const baselineEnd = new Date(periodStart.getTime() - 1);
    const baselineStart = new Date(baselineEnd.getTime() - periodMs + 1);

    const [currentRows, baselineRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ event_name: string; count: bigint }>>`
        SELECT "event_name", COUNT(*)::bigint AS count
        FROM events
        WHERE "project_id" = ${projectId}
          AND "validation_status" = 'VALID'
          AND "event_timestamp" >= ${periodStart}
          AND "event_timestamp" <= ${periodEnd}
        GROUP BY "event_name"
      `,
      this.prisma.$queryRaw<Array<{ event_name: string; count: bigint }>>`
        SELECT "event_name", COUNT(*)::bigint AS count
        FROM events
        WHERE "project_id" = ${projectId}
          AND "validation_status" = 'VALID'
          AND "event_timestamp" >= ${baselineStart}
          AND "event_timestamp" <= ${baselineEnd}
        GROUP BY "event_name"
      `,
    ]);

    const currentMap = new Map<string, number>();
    for (const row of currentRows) {
      currentMap.set(row.event_name, Number(row.count));
    }

    const baselineMap = new Map<string, number>();
    for (const row of baselineRows) {
      baselineMap.set(row.event_name, Number(row.count));
    }

    const allNames = new Set([...currentMap.keys(), ...baselineMap.keys()]);
    const changes: ActivityChangeEvidence[] = [];

    for (const eventName of allNames) {
      const curr = currentMap.get(eventName) ?? 0;
      const base = baselineMap.get(eventName) ?? 0;
      const combined = curr + base;
      const percentChange =
        base === 0
          ? curr > 0
            ? 100
            : 0
          : Math.round(((curr - base) / base) * 1000) / 10;
      const direction: 'increase' | 'decrease' | 'unchanged' =
        curr > base ? 'increase' : curr < base ? 'decrease' : 'unchanged';
      const significant = combined >= 10 && Math.abs(percentChange) > 30;

      changes.push({
        eventName,
        currentCount: curr,
        baselineCount: base,
        direction,
        percentChange,
        significant,
      });
    }

    changes.sort(
      (a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange),
    );
    return changes;
  }

  private async queryFeatureUsage(
    projectId: string,
    features: Array<{ id: string; name: string }>,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<FeatureUsageEvidence[]> {
    if (features.length === 0) return [];

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
        AND e."event_timestamp" >= ${periodStart}
        AND e."event_timestamp" <= ${periodEnd}
      GROUP BY fem."feature_id"
    `;

    const featureEventMap = new Map<string, number>();
    for (const row of featureEventRows) {
      featureEventMap.set(row.feature_id, Number(row.count));
    }

    const featuresWithData = features.filter(
      (f) => (featureEventMap.get(f.id) ?? 0) > 0,
    );
    const totalEventsAcross = featuresWithData.reduce(
      (sum, f) => sum + (featureEventMap.get(f.id) ?? 0),
      0,
    );
    const meanEvents =
      featuresWithData.length > 0
        ? totalEventsAcross / featuresWithData.length
        : 0;
    const highThreshold = meanEvents * 2;
    const lowThreshold = meanEvents * 0.25;

    return features.map((f) => {
      const totalEvents = featureEventMap.get(f.id) ?? 0;
      let classification: 'high' | 'low' | 'normal';
      if (totalEvents === 0) {
        classification = 'low';
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
      };
    });
  }

  private async queryTopEvents(
    projectId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<TopEventEvidence[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ event_name: string; count: bigint }>
    >`
      SELECT "event_name", COUNT(*)::bigint AS count
      FROM events
      WHERE "project_id" = ${projectId}
        AND "validation_status" = 'VALID'
        AND "event_timestamp" >= ${periodStart}
        AND "event_timestamp" <= ${periodEnd}
      GROUP BY "event_name"
      ORDER BY count DESC
      LIMIT 20
    `;
    return rows.map((r) => ({
      eventName: r.event_name,
      count: Number(r.count),
    }));
  }
}
