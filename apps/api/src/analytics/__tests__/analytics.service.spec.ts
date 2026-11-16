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
