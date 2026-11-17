import { Injectable, Logger } from '@nestjs/common';
import type {
  EvidencePackage,
  FeatureAdoptionEvidence,
  ActivityChangeEvidence,
  FeatureUsageEvidence,
} from './evidence-gatherer.service.js';

export interface GeneratedRecommendation {
  title: string;
  summary: string;
  suggestedAction: string;
  category: string;
  affectedFeatureId: string | null;
  affectedArea: string | null;
  evidence: Record<string, unknown>;
}

const VALID_CATEGORIES = [
  'adoption',
  'engagement',
  'retention',
  'ux',
  'general',
];

@Injectable()
export class RecommendationGeneratorService {
  private readonly logger = new Logger(RecommendationGeneratorService.name);

  async generateRecommendations(
    evidencePackage: EvidencePackage,
  ): Promise<GeneratedRecommendation[]> {
    const recommendations =
      this.generateRuleBasedRecommendations(evidencePackage);

    return recommendations.filter((r) =>
      this.validateRecommendation(r, evidencePackage),
    );
  }

  private generateRuleBasedRecommendations(
    evidence: EvidencePackage,
  ): GeneratedRecommendation[] {
    const recommendations: GeneratedRecommendation[] = [];

    this.detectLowAdoption(evidence, recommendations);
    this.detectSignificantActivityChanges(evidence, recommendations);
    this.detectHighUsageFeatures(evidence, recommendations);
    this.detectLowUsageFeatures(evidence, recommendations);
    this.detectOverallTrends(evidence, recommendations);

    return recommendations;
  }

  private detectLowAdoption(
    evidence: EvidencePackage,
    recommendations: GeneratedRecommendation[],
  ): void {
    if (evidence.activeUsers === 0) return;

    for (const fa of evidence.featureAdoption) {
      if (fa.adoptionRate < 10 && fa.featureUsers > 0) {
        recommendations.push({
          title: `Low adoption: ${fa.featureName}`,
          summary: `${fa.featureName} has an adoption rate of ${fa.adoptionRate}% (${fa.featureUsers} of ${fa.totalUsers} active users) during ${evidence.period.start} to ${evidence.period.end}. This suggests users may not be discovering or finding value in this feature.`,
          suggestedAction: `Investigate discoverability of ${fa.featureName}. Consider adding onboarding prompts, improving navigation, or reviewing whether the feature solves a real user need.`,
          category: 'adoption',
          affectedFeatureId: fa.featureId,
          affectedArea: fa.featureName,
          evidence: this.buildFeatureAdoptionEvidence(fa, evidence),
        });
      }
    }
  }

  private detectSignificantActivityChanges(
    evidence: EvidencePackage,
    recommendations: GeneratedRecommendation[],
  ): void {
    const significantChanges = evidence.activityChanges.filter(
      (c) => c.significant,
    );

    for (const change of significantChanges.slice(0, 3)) {
      const feature = evidence.features.find((f) =>
        f.eventNames.includes(change.eventName),
      );

      if (change.direction === 'decrease') {
        recommendations.push({
          title: `Declining activity: ${change.eventName}`,
          summary: `${change.eventName} decreased by ${Math.abs(change.percentChange)}% (from ${change.baselineCount} to ${change.currentCount} events) compared to the previous period. This may indicate a usability issue or reduced user interest.`,
          suggestedAction: `Review recent changes to the ${feature?.name ?? change.eventName} workflow. Check for bugs, UX regressions, or competing features that may be redirecting user behavior.`,
          category: 'engagement',
          affectedFeatureId: feature?.id ?? null,
          affectedArea: feature?.name ?? change.eventName,
          evidence: this.buildActivityChangeEvidence(change, evidence),
        });
      } else if (change.direction === 'increase') {
        recommendations.push({
          title: `Growing activity: ${change.eventName}`,
          summary: `${change.eventName} increased by ${change.percentChange}% (from ${change.baselineCount} to ${change.currentCount} events) compared to the previous period. This positive trend may indicate growing user interest or successful recent changes.`,
          suggestedAction: `Consider investing further in the ${feature?.name ?? change.eventName} area. Evaluate whether the increased usage aligns with product goals and whether the feature can handle the growth.`,
          category: 'engagement',
          affectedFeatureId: feature?.id ?? null,
          affectedArea: feature?.name ?? change.eventName,
          evidence: this.buildActivityChangeEvidence(change, evidence),
        });
      }
    }
  }

  private detectHighUsageFeatures(
    evidence: EvidencePackage,
    recommendations: GeneratedRecommendation[],
  ): void {
    const highUsage = evidence.featureUsage.filter(
      (f) => f.classification === 'high',
    );

    for (const fu of highUsage.slice(0, 2)) {
      recommendations.push({
        title: `High engagement: ${fu.featureName}`,
        summary: `${fu.featureName} has significantly higher usage (${fu.totalEvents} events) than other features during ${evidence.period.start} to ${evidence.period.end}. This is a core value driver for your users.`,
        suggestedAction: `Prioritize reliability and performance of ${fu.featureName}. Consider expanding related capabilities and ensuring the experience scales well.`,
        category: 'engagement',
        affectedFeatureId: fu.featureId,
        affectedArea: fu.featureName,
        evidence: this.buildFeatureUsageEvidence(fu, evidence),
      });
    }
  }

  private detectLowUsageFeatures(
    evidence: EvidencePackage,
    recommendations: GeneratedRecommendation[],
  ): void {
    const lowUsage = evidence.featureUsage.filter(
      (f) => f.classification === 'low' && f.totalEvents > 0,
    );

    for (const fu of lowUsage.slice(0, 2)) {
      const adoption = evidence.featureAdoption.find(
        (fa) => fa.featureId === fu.featureId,
      );
      if (adoption && adoption.adoptionRate < 10) continue; // already covered by low adoption

      recommendations.push({
        title: `Low engagement: ${fu.featureName}`,
        summary: `${fu.featureName} has significantly lower usage (${fu.totalEvents} events) compared to other features during ${evidence.period.start} to ${evidence.period.end}. Users may not find it valuable or it may need improvement.`,
        suggestedAction: `Review ${fu.featureName} for usability issues. Consider user research to understand why engagement is low and whether the feature should be improved or deprecated.`,
        category: 'engagement',
        affectedFeatureId: fu.featureId,
        affectedArea: fu.featureName,
        evidence: this.buildFeatureUsageEvidence(fu, evidence),
      });
    }
  }

  private detectOverallTrends(
    evidence: EvidencePackage,
    recommendations: GeneratedRecommendation[],
  ): void {
    if (evidence.features.length > 0 && evidence.featureAdoption.length > 0) {
      const avgAdoption =
        evidence.featureAdoption.reduce((sum, fa) => sum + fa.adoptionRate, 0) /
        evidence.featureAdoption.length;

      if (avgAdoption < 20 && evidence.activeUsers >= 5) {
        recommendations.push({
          title: 'Overall feature adoption is low',
          summary: `Average feature adoption across ${evidence.featureAdoption.length} features is ${Math.round(avgAdoption * 10) / 10}% during ${evidence.period.start} to ${evidence.period.end}. Most users are not engaging with the defined product features.`,
          suggestedAction:
            'Review feature-to-event mappings to ensure they accurately reflect feature usage. Consider whether features need better onboarding, improved visibility, or repositioning in the product.',
          category: 'adoption',
          affectedFeatureId: null,
          affectedArea: 'All features',
          evidence: {
            averageAdoptionRate: Math.round(avgAdoption * 10) / 10,
            featureCount: evidence.featureAdoption.length,
            activeUsers: evidence.activeUsers,
            period: evidence.period,
          },
        });
      }
    }
  }

  private validateRecommendation(
    rec: GeneratedRecommendation,
    evidence: EvidencePackage,
  ): boolean {
    if (!rec.title || !rec.summary || !rec.suggestedAction) {
      this.logger.warn(`Recommendation rejected: missing required fields`);
      return false;
    }

    if (!VALID_CATEGORIES.includes(rec.category)) {
      this.logger.warn(
        `Recommendation rejected: invalid category "${rec.category}"`,
      );
      return false;
    }

    if (!rec.evidence || typeof rec.evidence !== 'object') {
      this.logger.warn(`Recommendation rejected: missing evidence`);
      return false;
    }

    return true;
  }

  private buildFeatureAdoptionEvidence(
    fa: FeatureAdoptionEvidence,
    evidence: EvidencePackage,
  ): Record<string, unknown> {
    return {
      type: 'feature_adoption',
      featureId: fa.featureId,
      featureName: fa.featureName,
      adoptionRate: fa.adoptionRate,
      featureUsers: fa.featureUsers,
      totalUsers: fa.totalUsers,
      activeUsers: evidence.activeUsers,
      period: evidence.period,
    };
  }

  private buildActivityChangeEvidence(
    change: ActivityChangeEvidence,
    evidence: EvidencePackage,
  ): Record<string, unknown> {
    return {
      type: 'activity_change',
      eventName: change.eventName,
      currentCount: change.currentCount,
      baselineCount: change.baselineCount,
      direction: change.direction,
      percentChange: change.percentChange,
      period: evidence.period,
    };
  }

  private buildFeatureUsageEvidence(
    fu: FeatureUsageEvidence,
    evidence: EvidencePackage,
  ): Record<string, unknown> {
    return {
      type: 'feature_usage',
      featureId: fu.featureId,
      featureName: fu.featureName,
      totalEvents: fu.totalEvents,
      classification: fu.classification,
      period: evidence.period,
    };
  }
}
