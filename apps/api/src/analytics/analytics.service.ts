import { Injectable, NotFoundException } from '@nestjs/common';
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
}
