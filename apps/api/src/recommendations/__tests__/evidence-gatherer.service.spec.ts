import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvidenceGathererService } from '../evidence-gatherer.service.js';

function makePrisma() {
  return {
    project: {
      findFirstOrThrow: vi.fn(),
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

describe('EvidenceGathererService', () => {
  let service: EvidenceGathererService;
  let prisma: ReturnType<typeof makePrisma>;

  const projectId = 'proj-1';
  const orgId = 'org-1';
  const periodStart = new Date('2026-10-18T00:00:00.000Z');
  const periodEnd = new Date('2026-11-17T23:59:59.999Z');

  beforeEach(() => {
    prisma = makePrisma();
    service = new EvidenceGathererService(prisma as any);
  });

  it('gathers evidence for a project with features and events', async () => {
    prisma.project.findFirstOrThrow.mockResolvedValue({
      id: projectId,
      name: 'Test Project',
      description: 'A test',
    });

    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'feat-1',
        name: 'Dashboard',
        status: 'ACTIVE',
        mappings: [{ eventName: 'view_dashboard' }],
      },
    ]);

    prisma.event.count.mockResolvedValue(100);

    // Mock $queryRaw for different queries
    prisma.$queryRaw.mockImplementation((...args: unknown[]) => {
      const sql = String(args[0]);
      if (sql.includes('COUNT(DISTINCT')) {
        return Promise.resolve([{ count: BigInt(50) }]);
      }
      if (sql.includes('feature_id')) {
        return Promise.resolve([{ feature_id: 'feat-1', count: BigInt(80) }]);
      }
      if (sql.includes('GROUP BY "event_name"')) {
        return Promise.resolve([
          { event_name: 'view_dashboard', count: BigInt(80) },
          { event_name: 'click_button', count: BigInt(20) },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await service.gatherEvidence(
      projectId,
      orgId,
      periodStart,
      periodEnd,
    );

    expect(result.project.name).toBe('Test Project');
    expect(result.features).toHaveLength(1);
    expect(result.features[0].name).toBe('Dashboard');
    expect(result.period.start).toBe('2026-10-18');
    expect(result.period.end).toBe('2026-11-17');
  });

  it('handles project with no features', async () => {
    prisma.project.findFirstOrThrow.mockResolvedValue({
      id: projectId,
      name: 'Empty Project',
      description: null,
    });

    prisma.feature.findMany.mockResolvedValue([]);
    prisma.event.count.mockResolvedValue(50);

    prisma.$queryRaw.mockImplementation((...args: unknown[]) => {
      const sql = String(args[0]);
      if (sql.includes('COUNT(DISTINCT')) {
        return Promise.resolve([{ count: BigInt(10) }]);
      }
      if (sql.includes('GROUP BY "event_name"')) {
        return Promise.resolve([
          { event_name: 'page_view', count: BigInt(50) },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await service.gatherEvidence(
      projectId,
      orgId,
      periodStart,
      periodEnd,
    );

    expect(result.features).toEqual([]);
    expect(result.featureAdoption).toEqual([]);
    expect(result.featureUsage).toEqual([]);
    expect(result.activeUsers).toBe(10);
    expect(result.totalEvents).toBe(50);
  });

  it('handles no active users', async () => {
    prisma.project.findFirstOrThrow.mockResolvedValue({
      id: projectId,
      name: 'Quiet Project',
      description: null,
    });

    prisma.feature.findMany.mockResolvedValue([
      {
        id: 'feat-1',
        name: 'Feature A',
        status: 'ACTIVE',
        mappings: [{ eventName: 'ev1' }],
      },
    ]);

    prisma.event.count.mockResolvedValue(0);

    prisma.$queryRaw.mockImplementation(() => {
      return Promise.resolve([{ count: BigInt(0) }]);
    });

    const result = await service.gatherEvidence(
      projectId,
      orgId,
      periodStart,
      periodEnd,
    );

    expect(result.activeUsers).toBe(0);
    expect(result.featureAdoption[0].adoptionRate).toBe(0);
  });
});
