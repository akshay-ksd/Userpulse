import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@userpulse/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { EvidenceGathererService } from '../recommendations/evidence-gatherer.service.js';
import { RecommendationGeneratorService } from '../recommendations/recommendation-generator.service.js';

const MIN_EVENT_COUNT = 10;

@Injectable()
export class AnalysisRunProcessorService {
  private readonly logger = new Logger(AnalysisRunProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceGatherer: EvidenceGathererService,
    private readonly recommendationGenerator: RecommendationGeneratorService,
  ) {}

  @Interval(10_000)
  async processNextRun(): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const runs: Array<{ id: string }> = await tx.$queryRaw(
          Prisma.sql`SELECT id FROM analysis_runs WHERE status = 'QUEUED' ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
        );

        if (runs.length === 0) {
          return;
        }

        const runId = runs[0].id;

        await tx.analysisRun.update({
          where: { id: runId },
          data: { status: 'RUNNING', startedAt: new Date() },
        });

        const run = await tx.analysisRun.findUniqueOrThrow({
          where: { id: runId },
        });

        try {
          const eventCount = await tx.event.count({
            where: {
              projectId: run.projectId,
              validationStatus: 'VALID',
              processingStatus: 'PROCESSED',
              eventTimestamp: {
                gte: run.periodStart,
                lte: run.periodEnd,
              },
            },
          });

          if (eventCount < MIN_EVENT_COUNT) {
            await tx.analysisRun.update({
              where: { id: runId },
              data: {
                status: 'INSUFFICIENT_DATA',
                eventCount,
                statusMessage: `Insufficient data: only ${eventCount} valid events found in the analysis period. At least ${MIN_EVENT_COUNT} events are required.`,
                completedAt: new Date(),
              },
            });
            this.logger.log(
              `Analysis run ${runId}: insufficient data (${eventCount} events)`,
            );
            return;
          }

          // Gather evidence and generate recommendations
          let recommendationCount = 0;
          let statusMessage: string | null = null;

          try {
            const evidence = await this.evidenceGatherer.gatherEvidence(
              run.projectId,
              run.organizationId,
              run.periodStart,
              run.periodEnd,
            );

            const recommendations =
              await this.recommendationGenerator.generateRecommendations(
                evidence,
              );

            if (recommendations.length > 0) {
              await tx.recommendation.createMany({
                data: recommendations.map((rec) => ({
                  analysisRunId: runId,
                  projectId: run.projectId,
                  organizationId: run.organizationId,
                  title: rec.title,
                  summary: rec.summary,
                  suggestedAction: rec.suggestedAction,
                  category: rec.category,
                  affectedFeatureId: rec.affectedFeatureId,
                  affectedArea: rec.affectedArea,
                  evidence: rec.evidence as Prisma.InputJsonValue,
                  confidence: rec.confidence,
                  impact: rec.impact,
                  reach: rec.reach,
                  priorityScore: rec.priorityScore,
                  periodStart: run.periodStart,
                  periodEnd: run.periodEnd,
                  status: 'PUBLISHED',
                })),
              });
              recommendationCount = recommendations.length;
            }
          } catch (recError) {
            const message =
              recError instanceof Error ? recError.message : String(recError);
            this.logger.warn(
              `Analysis run ${runId}: recommendation generation failed: ${message}`,
            );
            statusMessage = `Analysis completed with ${eventCount} events. Recommendation generation failed: ${message}`;
          }

          await tx.analysisRun.update({
            where: { id: runId },
            data: {
              status: 'COMPLETED',
              eventCount,
              statusMessage:
                statusMessage ??
                (recommendationCount > 0
                  ? `Analysis completed: ${recommendationCount} recommendation(s) generated.`
                  : `Analysis completed with ${eventCount} events. No actionable recommendations found.`),
              completedAt: new Date(),
            },
          });
          this.logger.log(
            `Analysis run ${runId}: completed with ${eventCount} events, ${recommendationCount} recommendations`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          await tx.analysisRun.update({
            where: { id: runId },
            data: {
              status: 'FAILED',
              statusMessage: `Analysis failed: ${message}`,
              completedAt: new Date(),
            },
          });
          this.logger.error(`Analysis run ${runId} failed: ${message}`);
        }
      });
    } catch (error) {
      this.logger.error(
        'Failed to process analysis run',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
