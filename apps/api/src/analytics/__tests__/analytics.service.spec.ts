import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from '../analytics.service.js';

function makePrisma() {
  return {
    organizationMember: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    feature: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    featureEventMapping: {
      findMany: vi.fn(),
    },
    event: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AnalyticsService(prisma as any);
  });

  it('throws NotFoundException when user is not a member', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    await expect(
      service.getEventActivity(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when project does not exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.getEventActivity(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns total and zero-filled daily counts', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.event.count.mockResolvedValue(5);
    prisma.$queryRaw.mockResolvedValue([
      { day: new Date('2026-11-02'), count: BigInt(3) },
      { day: new Date('2026-11-04'), count: BigInt(2) },
    ]);

    const result = await service.getEventActivity(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-05',
    );

    expect(result.total).toBe(5);
    expect(result.startDate).toBe('2026-11-01');
    expect(result.endDate).toBe('2026-11-05');
    expect(result.daily).toEqual([
      { date: '2026-11-01', count: 0 },
      { date: '2026-11-02', count: 3 },
      { date: '2026-11-03', count: 0 },
      { date: '2026-11-04', count: 2 },
      { date: '2026-11-05', count: 0 },
    ]);
  });

  it('returns all zeros for empty date range', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.event.count.mockResolvedValue(0);
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.getEventActivity(
      'org1',
      'proj1',
      'user1',
      '2026-11-10',
      '2026-11-12',
    );

    expect(result.total).toBe(0);
    expect(result.daily).toEqual([
      { date: '2026-11-10', count: 0 },
      { date: '2026-11-11', count: 0 },
      { date: '2026-11-12', count: 0 },
    ]);
  });

  it('handles single-day range', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.event.count.mockResolvedValue(10);
    prisma.$queryRaw.mockResolvedValue([
      { day: new Date('2026-11-15'), count: BigInt(10) },
    ]);

    const result = await service.getEventActivity(
      'org1',
      'proj1',
      'user1',
      '2026-11-15',
      '2026-11-15',
    );

    expect(result.total).toBe(10);
    expect(result.daily).toEqual([{ date: '2026-11-15', count: 10 }]);
  });
});

describe('AnalyticsService — getActiveUsers', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AnalyticsService(prisma as any);
  });

  it('throws NotFoundException when user is not a member', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    await expect(
      service.getActiveUsers(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when project does not exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.getActiveUsers(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns total and zero-filled daily counts', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(3) }])
      .mockResolvedValueOnce([
        { day: new Date('2026-11-02'), count: BigInt(2) },
        { day: new Date('2026-11-04'), count: BigInt(1) },
      ]);

    const result = await service.getActiveUsers(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-05',
    );

    expect(result.total).toBe(3);
    expect(result.startDate).toBe('2026-11-01');
    expect(result.endDate).toBe('2026-11-05');
    expect(result.daily).toEqual([
      { date: '2026-11-01', count: 0 },
      { date: '2026-11-02', count: 2 },
      { date: '2026-11-03', count: 0 },
      { date: '2026-11-04', count: 1 },
      { date: '2026-11-05', count: 0 },
    ]);
  });

  it('returns all zeros for empty date range', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const result = await service.getActiveUsers(
      'org1',
      'proj1',
      'user1',
      '2026-11-10',
      '2026-11-12',
    );

    expect(result.total).toBe(0);
    expect(result.daily).toEqual([
      { date: '2026-11-10', count: 0 },
      { date: '2026-11-11', count: 0 },
      { date: '2026-11-12', count: 0 },
    ]);
  });

  it('returns definition string', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const result = await service.getActiveUsers(
      'org1',
      'proj1',
      'user1',
      '2026-11-15',
      '2026-11-15',
    );

    expect(result.definition).toBe(
      'An active user is a distinct identified (userId) or anonymous (anonymousId) reference that generated at least one valid event during the selected period.',
    );
  });
});

describe('AnalyticsService — getFeatureAdoption', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AnalyticsService(prisma as any);
  });

  it('throws NotFoundException when user is not a member', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    await expect(
      service.getFeatureAdoption(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when project does not exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.getFeatureAdoption(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns adoption rates for features with mapped events', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(20) }])
      .mockResolvedValueOnce([
        { feature_id: 'f1', count: BigInt(10) },
        { feature_id: 'f2', count: BigInt(5) },
      ]);
    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'f1',
        projectId: 'proj1',
        name: 'Login',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      {
        id: 'f2',
        projectId: 'proj1',
        name: 'Search',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      {
        id: 'f3',
        projectId: 'proj1',
        name: 'Export',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getFeatureAdoption(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.totalActiveUsers).toBe(20);
    expect(result.features).toEqual([
      {
        featureId: 'f1',
        featureName: 'Login',
        adoptionRate: 50,
        featureUsers: 10,
        totalUsers: 20,
      },
      {
        featureId: 'f2',
        featureName: 'Search',
        adoptionRate: 25,
        featureUsers: 5,
        totalUsers: 20,
      },
      {
        featureId: 'f3',
        featureName: 'Export',
        adoptionRate: 0,
        featureUsers: 0,
        totalUsers: 20,
      },
    ]);
  });

  it('returns 0% adoption when totalActiveUsers is 0', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);
    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'f1',
        projectId: 'proj1',
        name: 'Login',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getFeatureAdoption(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.totalActiveUsers).toBe(0);
    expect(result.features[0].adoptionRate).toBe(0);
    expect(result.features[0].featureUsers).toBe(0);
  });

  it('returns empty features array when no active features exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(10) }])
      .mockResolvedValueOnce([]);
    prisma.feature.findMany.mockResolvedValue([]);

    const result = await service.getFeatureAdoption(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.features).toEqual([]);
    expect(result.totalActiveUsers).toBe(10);
  });

  it('returns definition string', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);
    prisma.feature.findMany.mockResolvedValue([]);

    const result = await service.getFeatureAdoption(
      'org1',
      'proj1',
      'user1',
      '2026-11-15',
      '2026-11-15',
    );

    expect(result.definition).toContain('Feature adoption rate');
  });

  it('sorts features by adoption rate descending', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(100) }])
      .mockResolvedValueOnce([
        { feature_id: 'f1', count: BigInt(10) },
        { feature_id: 'f2', count: BigInt(50) },
        { feature_id: 'f3', count: BigInt(30) },
      ]);
    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'f1',
        projectId: 'proj1',
        name: 'A',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      {
        id: 'f2',
        projectId: 'proj1',
        name: 'B',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      {
        id: 'f3',
        projectId: 'proj1',
        name: 'C',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getFeatureAdoption(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.features.map((f) => f.featureName)).toEqual(['B', 'C', 'A']);
    expect(result.features.map((f) => f.adoptionRate)).toEqual([50, 30, 10]);
  });
});

describe('AnalyticsService — getFeatureUsageTrends', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AnalyticsService(prisma as any);
  });

  it('throws NotFoundException when user is not a member', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    await expect(
      service.getFeatureUsageTrends(
        'org1',
        'proj1',
        'user1',
        'f1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when project does not exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.getFeatureUsageTrends(
        'org1',
        'proj1',
        'user1',
        'f1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when feature does not exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.feature.findFirst.mockResolvedValue(null);

    await expect(
      service.getFeatureUsageTrends(
        'org1',
        'proj1',
        'user1',
        'f1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns daily counts with zero-fill', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.feature.findFirst.mockResolvedValue({
      id: 'f1',
      projectId: 'proj1',
      name: 'Login',
      status: 'ACTIVE',
    });
    prisma.featureEventMapping.findMany.mockResolvedValue([
      {
        id: 'm1',
        featureId: 'f1',
        projectId: 'proj1',
        eventName: 'login_click',
      },
    ]);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(8) }])
      .mockResolvedValueOnce([
        { day: new Date('2026-11-02'), count: BigInt(5) },
        { day: new Date('2026-11-04'), count: BigInt(3) },
      ]);

    const result = await service.getFeatureUsageTrends(
      'org1',
      'proj1',
      'user1',
      'f1',
      '2026-11-01',
      '2026-11-05',
    );

    expect(result.featureId).toBe('f1');
    expect(result.featureName).toBe('Login');
    expect(result.total).toBe(8);
    expect(result.daily).toEqual([
      { date: '2026-11-01', count: 0 },
      { date: '2026-11-02', count: 5 },
      { date: '2026-11-03', count: 0 },
      { date: '2026-11-04', count: 3 },
      { date: '2026-11-05', count: 0 },
    ]);
  });

  it('returns total 0 and zero-filled days when no mappings exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.feature.findFirst.mockResolvedValue({
      id: 'f1',
      projectId: 'proj1',
      name: 'Empty Feature',
      status: 'ACTIVE',
    });
    prisma.featureEventMapping.findMany.mockResolvedValue([]);

    const result = await service.getFeatureUsageTrends(
      'org1',
      'proj1',
      'user1',
      'f1',
      '2026-11-10',
      '2026-11-12',
    );

    expect(result.total).toBe(0);
    expect(result.daily).toEqual([
      { date: '2026-11-10', count: 0 },
      { date: '2026-11-11', count: 0 },
      { date: '2026-11-12', count: 0 },
    ]);
  });

  it('returns feature name and id', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.feature.findFirst.mockResolvedValue({
      id: 'f1',
      projectId: 'proj1',
      name: 'Search',
      status: 'ACTIVE',
    });
    prisma.featureEventMapping.findMany.mockResolvedValue([]);

    const result = await service.getFeatureUsageTrends(
      'org1',
      'proj1',
      'user1',
      'f1',
      '2026-11-15',
      '2026-11-15',
    );

    expect(result.featureId).toBe('f1');
    expect(result.featureName).toBe('Search');
  });
});

describe('AnalyticsService — getFeatureUsageComparison', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AnalyticsService(prisma as any);
  });

  it('throws NotFoundException when user is not a member', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    await expect(
      service.getFeatureUsageComparison(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when project does not exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.getFeatureUsageComparison(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns features ranked by total events descending', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([
      { feature_id: 'f1', count: BigInt(10) },
      { feature_id: 'f2', count: BigInt(50) },
      { feature_id: 'f3', count: BigInt(30) },
    ]);
    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'f1',
        projectId: 'proj1',
        name: 'Login',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      {
        id: 'f2',
        projectId: 'proj1',
        name: 'Search',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      {
        id: 'f3',
        projectId: 'proj1',
        name: 'Export',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getFeatureUsageComparison(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.features.map((f) => f.featureName)).toEqual([
      'Search',
      'Export',
      'Login',
    ]);
    expect(result.features.map((f) => f.totalEvents)).toEqual([50, 30, 10]);
    expect(result.startDate).toBe('2026-11-01');
    expect(result.endDate).toBe('2026-11-07');
    expect(result.metric).toContain('Total valid events');
  });

  it('returns 0 events for features with no activity', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([
      { feature_id: 'f1', count: BigInt(5) },
    ]);
    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'f1',
        projectId: 'proj1',
        name: 'Login',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      {
        id: 'f2',
        projectId: 'proj1',
        name: 'Search',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getFeatureUsageComparison(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.features[0]).toEqual({
      featureId: 'f1',
      featureName: 'Login',
      totalEvents: 5,
    });
    expect(result.features[1]).toEqual({
      featureId: 'f2',
      featureName: 'Search',
      totalEvents: 0,
    });
  });

  it('returns empty features array when no active features exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.feature.findMany.mockResolvedValue([]);

    const result = await service.getFeatureUsageComparison(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.features).toEqual([]);
  });
});

describe('AnalyticsService — getUserJourneys', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AnalyticsService(prisma as any);
  });

  it('throws NotFoundException when user is not a member', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    await expect(
      service.getUserJourneys(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
        3,
        2,
        20,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when project does not exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.getUserJourneys(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
        3,
        2,
        20,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns empty sequences when no users in range', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

    const result = await service.getUserJourneys(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
      3,
      2,
      20,
    );

    expect(result.sequences).toEqual([]);
    expect(result.totalUsers).toBe(0);
    expect(result.startDate).toBe('2026-11-01');
    expect(result.endDate).toBe('2026-11-07');
    expect(result.maxSteps).toBe(3);
    expect(result.minUsers).toBe(2);
  });

  it('returns sequences sorted by user count', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([{ count: BigInt(100) }]);
    prisma.$queryRawUnsafe.mockResolvedValue([
      { sequence: ['login', 'dashboard', 'search'], user_count: BigInt(50) },
      { sequence: ['login', 'dashboard', 'settings'], user_count: BigInt(30) },
      {
        sequence: ['signup', 'onboarding', 'dashboard'],
        user_count: BigInt(10),
      },
    ]);

    const result = await service.getUserJourneys(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
      3,
      2,
      20,
    );

    expect(result.sequences).toHaveLength(3);
    expect(result.sequences[0]).toEqual({
      sequence: ['login', 'dashboard', 'search'],
      userCount: 50,
      lowVolume: false,
    });
    expect(result.sequences[1]).toEqual({
      sequence: ['login', 'dashboard', 'settings'],
      userCount: 30,
      lowVolume: false,
    });
    expect(result.totalUsers).toBe(100);
  });

  it('labels low-volume sequences correctly', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([{ count: BigInt(100) }]);
    prisma.$queryRawUnsafe.mockResolvedValue([
      { sequence: ['login', 'dashboard', 'search'], user_count: BigInt(50) },
      { sequence: ['login', 'settings', 'logout'], user_count: BigInt(4) },
    ]);

    const result = await service.getUserJourneys(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
      3,
      2,
      20,
    );

    expect(result.sequences[0].lowVolume).toBe(false);
    expect(result.sequences[1].lowVolume).toBe(true);
  });

  it('includes identity and session rule strings', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

    const result = await service.getUserJourneys(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
      3,
      2,
      20,
    );

    expect(result.identityRule).toContain('userId');
    expect(result.identityRule).toContain('anonymousId');
    expect(result.sessionRule).toContain('No session windowing');
  });
});

describe('AnalyticsService — getFeatureUsageInsights', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AnalyticsService(prisma as any);
  });

  it('throws NotFoundException when user is not a member', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);

    await expect(
      service.getFeatureUsageInsights(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when project does not exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.getFeatureUsageInsights(
        'org1',
        'proj1',
        'user1',
        '2026-11-01',
        '2026-11-07',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('classifies features as high, low, or normal', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([
      { feature_id: 'f1', count: BigInt(500) },
      { feature_id: 'f2', count: BigInt(100) },
      { feature_id: 'f3', count: BigInt(10) },
    ]);
    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'f1',
        name: 'Feature A',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
      {
        id: 'f2',
        name: 'Feature B',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
      {
        id: 'f3',
        name: 'Feature C',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getFeatureUsageInsights(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.insufficientData).toBe(false);
    expect(result.insights).toHaveLength(3);
    expect(result.insights[0]).toMatchObject({
      featureId: 'f1',
      totalEvents: 500,
      classification: 'high',
    });
    expect(result.insights[2]).toMatchObject({
      featureId: 'f3',
      totalEvents: 10,
      classification: 'low',
    });
    expect(result.meanEvents).toBeGreaterThan(0);
    expect(result.highThreshold).toBeCloseTo(result.meanEvents * 2, 0);
    expect(result.lowThreshold).toBeCloseTo(result.meanEvents * 0.25, 0);
  });

  it('returns insufficient data when fewer than 2 features have events', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([
      { feature_id: 'f1', count: BigInt(100) },
    ]);
    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'f1',
        name: 'Feature A',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
      {
        id: 'f2',
        name: 'Feature B',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getFeatureUsageInsights(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.insufficientData).toBe(true);
    expect(result.insights).toEqual([]);
    expect(result.insufficientDataReason).toContain('At least 2 features');
  });

  it('labels features with zero events as insufficientData', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([
      { feature_id: 'f1', count: BigInt(200) },
      { feature_id: 'f2', count: BigInt(100) },
    ]);
    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'f1',
        name: 'Feature A',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
      {
        id: 'f2',
        name: 'Feature B',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
      {
        id: 'f3',
        name: 'Feature C',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getFeatureUsageInsights(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    const noDataFeature = result.insights.find((i) => i.featureId === 'f3');
    expect(noDataFeature).toBeDefined();
    expect(noDataFeature!.insufficientData).toBe(true);
    expect(noDataFeature!.totalEvents).toBe(0);
    expect(noDataFeature!.classification).toBe('low');
  });

  it('returns empty insights when no active features exist', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.feature.findMany.mockResolvedValue([]);

    const result = await service.getFeatureUsageInsights(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.insufficientData).toBe(true);
    expect(result.insights).toEqual([]);
    expect(result.insufficientDataReason).toContain(
      'No features have event data',
    );
  });

  it('includes method description in result', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.project.findFirst.mockResolvedValue({
      id: 'proj1',
      organizationId: 'org1',
    });
    prisma.$queryRaw.mockResolvedValue([
      { feature_id: 'f1', count: BigInt(100) },
      { feature_id: 'f2', count: BigInt(50) },
    ]);
    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'f1',
        name: 'Feature A',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
      {
        id: 'f2',
        name: 'Feature B',
        status: 'ACTIVE',
        projectId: 'proj1',
        createdAt: new Date(),
      },
    ]);

    const result = await service.getFeatureUsageInsights(
      'org1',
      'proj1',
      'user1',
      '2026-11-01',
      '2026-11-07',
    );

    expect(result.method).toContain('2× mean');
    expect(result.method).toContain('0.25× mean');
  });
});
