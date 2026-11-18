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

  describe('scoring', () => {
    it('computes scores for feature_adoption evidence', async () => {
      const evidence = makeEvidence();
      const recs = await service.generateRecommendations(evidence);
      const lowAdoption = recs.find((r) => r.title.includes('Low adoption'));
      expect(lowAdoption).toBeDefined();
      expect(lowAdoption!.confidence).toBeGreaterThan(0);
      expect(lowAdoption!.confidence).toBeLessThanOrEqual(1);
      expect(lowAdoption!.impact).toBeGreaterThan(0);
      expect(lowAdoption!.impact).toBeLessThanOrEqual(1);
      expect(lowAdoption!.reach).toBeGreaterThanOrEqual(0);
      expect(lowAdoption!.reach).toBeLessThanOrEqual(1);
      expect(lowAdoption!.priorityScore).toBeCloseTo(
        lowAdoption!.reach * lowAdoption!.impact * lowAdoption!.confidence,
        3,
      );
    });

    it('computes scores for activity_change evidence', async () => {
      const evidence = makeEvidence();
      const recs = await service.generateRecommendations(evidence);
      const declining = recs.find((r) =>
        r.title.includes('Declining activity'),
      );
      expect(declining).toBeDefined();
      expect(declining!.confidence).toBeGreaterThan(0);
      expect(declining!.impact).toBeGreaterThan(0);
      expect(declining!.priorityScore).toBeCloseTo(
        declining!.reach * declining!.impact * declining!.confidence,
        3,
      );
    });

    it('computes scores for feature_usage evidence', async () => {
      const evidence = makeEvidence();
      const recs = await service.generateRecommendations(evidence);
      const highUsage = recs.find((r) => r.title.includes('High engagement'));
      expect(highUsage).toBeDefined();
      expect(highUsage!.confidence).toBeGreaterThan(0);
      expect(highUsage!.impact).toBe(0.4);
      expect(highUsage!.priorityScore).toBeCloseTo(
        highUsage!.reach * highUsage!.impact * highUsage!.confidence,
        3,
      );
    });

    it('computes generic scores for overall trend evidence', async () => {
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
      expect(overall!.confidence).toBe(0.3);
      expect(overall!.impact).toBe(0.5);
      expect(overall!.reach).toBe(1);
    });

    it('priorityScore equals reach * impact * confidence', async () => {
      const evidence = makeEvidence();
      const recs = await service.generateRecommendations(evidence);
      for (const rec of recs) {
        const expected =
          Math.round(rec.reach * rec.impact * rec.confidence * 10000) / 10000;
        expect(rec.priorityScore).toBe(expected);
      }
    });

    it('rejects recommendations with confidence below 0.2', async () => {
      const evidence = makeEvidence({
        featureAdoption: [
          {
            featureId: 'feat-1',
            featureName: 'Tiny',
            adoptionRate: 5,
            featureUsers: 1,
            totalUsers: 2,
          },
        ],
        activityChanges: [],
        featureUsage: [],
        activeUsers: 2,
      });
      const recs = await service.generateRecommendations(evidence);
      for (const rec of recs) {
        expect(rec.confidence).toBeGreaterThanOrEqual(0.2);
      }
    });

    it('all scores are in [0, 1] range', async () => {
      const evidence = makeEvidence();
      const recs = await service.generateRecommendations(evidence);
      for (const rec of recs) {
        expect(rec.confidence).toBeGreaterThanOrEqual(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
        expect(rec.impact).toBeGreaterThanOrEqual(0);
        expect(rec.impact).toBeLessThanOrEqual(1);
        expect(rec.reach).toBeGreaterThanOrEqual(0);
        expect(rec.reach).toBeLessThanOrEqual(1);
        expect(rec.priorityScore).toBeGreaterThanOrEqual(0);
        expect(rec.priorityScore).toBeLessThanOrEqual(1);
      }
    });
  });
});
