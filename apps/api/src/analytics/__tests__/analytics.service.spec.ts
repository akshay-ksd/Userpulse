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
      findMany: vi.fn(),
    },
    event: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
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
