import { describe, it, expect, beforeEach } from 'vitest';
import { RecommendationGeneratorService } from '../recommendation-generator.service.js';
import type { EvidencePackage } from '../evidence-gatherer.service.js';

function makeEvidence(
  overrides: Partial<EvidencePackage> = {},
): EvidencePackage {
  return {
    project: { id: 'proj-1', name: 'Test Project', description: null },
    features: [
      { id: 'feat-1', name: 'Dashboard', eventNames: ['view_dashboard'] },
      { id: 'feat-2', name: 'Reports', eventNames: ['view_report'] },
    ],
    featureAdoption: [
      {
        featureId: 'feat-1',
        featureName: 'Dashboard',
        adoptionRate: 45,
        featureUsers: 45,
        totalUsers: 100,
      },
      {
        featureId: 'feat-2',
        featureName: 'Reports',
        adoptionRate: 5,
        featureUsers: 5,
        totalUsers: 100,
      },
    ],
    activityChanges: [
      {
        eventName: 'view_dashboard',
        currentCount: 500,
        baselineCount: 300,
        direction: 'increase',
        percentChange: 66.7,
        significant: true,
      },
      {
        eventName: 'view_report',
        currentCount: 10,
        baselineCount: 50,
        direction: 'decrease',
        percentChange: -80,
        significant: true,
      },
    ],
    featureUsage: [
      {
        featureId: 'feat-1',
        featureName: 'Dashboard',
        totalEvents: 500,
        classification: 'high',
      },
      {
        featureId: 'feat-2',
        featureName: 'Reports',
        totalEvents: 10,
        classification: 'low',
      },
    ],
    topEvents: [
      { eventName: 'view_dashboard', count: 500 },
      { eventName: 'view_report', count: 10 },
    ],
    activeUsers: 100,
    totalEvents: 510,
    period: { start: '2026-10-18', end: '2026-11-17' },
    ...overrides,
  };
}

describe('RecommendationGeneratorService', () => {
  let service: RecommendationGeneratorService;

  beforeEach(() => {
    service = new RecommendationGeneratorService();
  });

  it('generates low-adoption recommendations', async () => {
    const evidence = makeEvidence();
    const recs = await service.generateRecommendations(evidence);

    const lowAdoption = recs.find((r) => r.title.includes('Low adoption'));
    expect(lowAdoption).toBeDefined();
    expect(lowAdoption!.category).toBe('adoption');
    expect(lowAdoption!.affectedFeatureId).toBe('feat-2');
    expect(lowAdoption!.summary).toContain('5%');
  });

  it('generates activity change recommendations', async () => {
    const evidence = makeEvidence();
    const recs = await service.generateRecommendations(evidence);

    const declining = recs.find((r) => r.title.includes('Declining activity'));
    expect(declining).toBeDefined();
    expect(declining!.category).toBe('engagement');
    expect(declining!.summary).toContain('80%');

    const growing = recs.find((r) => r.title.includes('Growing activity'));
    expect(growing).toBeDefined();
    expect(growing!.summary).toContain('66.7%');
  });

  it('generates high-usage feature recommendations', async () => {
    const evidence = makeEvidence();
    const recs = await service.generateRecommendations(evidence);

    const highUsage = recs.find((r) => r.title.includes('High engagement'));
    expect(highUsage).toBeDefined();
    expect(highUsage!.affectedFeatureId).toBe('feat-1');
    expect(highUsage!.evidence).toHaveProperty('type', 'feature_usage');
  });

  it('includes evidence with every recommendation', async () => {
    const evidence = makeEvidence();
    const recs = await service.generateRecommendations(evidence);

    for (const rec of recs) {
      expect(rec.evidence).toBeDefined();
      expect(typeof rec.evidence).toBe('object');
      expect(rec.evidence).toHaveProperty('period');
    }
  });

  it('includes required fields on every recommendation', async () => {
    const evidence = makeEvidence();
    const recs = await service.generateRecommendations(evidence);

    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.title).toBeTruthy();
      expect(rec.summary).toBeTruthy();
      expect(rec.suggestedAction).toBeTruthy();
      expect(rec.category).toBeTruthy();
    }
  });

  it('returns empty array when no patterns detected', async () => {
    const evidence = makeEvidence({
      features: [],
      featureAdoption: [],
      activityChanges: [],
      featureUsage: [],
      activeUsers: 0,
    });

    const recs = await service.generateRecommendations(evidence);
    expect(recs).toEqual([]);
  });

  it('detects overall low adoption', async () => {
    const evidence = makeEvidence({
      featureAdoption: [
        {
          featureId: 'feat-1',
          featureName: 'A',
          adoptionRate: 8,
          featureUsers: 8,
          totalUsers: 100,
        },
        {
          featureId: 'feat-2',
          featureName: 'B',
          adoptionRate: 12,
          featureUsers: 12,
          totalUsers: 100,
        },
      ],
      activityChanges: [],
      featureUsage: [],
      activeUsers: 100,
    });

    const recs = await service.generateRecommendations(evidence);
    const overall = recs.find((r) =>
      r.title.includes('Overall feature adoption'),
    );
    expect(overall).toBeDefined();
    expect(overall!.category).toBe('adoption');
  });
});
