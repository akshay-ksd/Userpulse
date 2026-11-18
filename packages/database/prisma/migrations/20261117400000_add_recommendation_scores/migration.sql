-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN "confidence" DOUBLE PRECISION,
ADD COLUMN "impact" DOUBLE PRECISION,
ADD COLUMN "reach" DOUBLE PRECISION,
ADD COLUMN "priorityScore" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "recommendations_projectId_priorityScore_idx" ON "recommendations"("projectId", "priorityScore" DESC);
