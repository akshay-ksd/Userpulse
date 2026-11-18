-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "suggestedAction" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "affectedFeatureId" TEXT,
    "affectedArea" TEXT,
    "evidence" JSONB NOT NULL,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendations_projectId_status_idx" ON "recommendations"("projectId", "status");

-- CreateIndex
CREATE INDEX "recommendations_analysisRunId_idx" ON "recommendations"("analysisRunId");

-- CreateIndex
CREATE INDEX "recommendations_projectId_createdAt_idx" ON "recommendations"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_affectedFeatureId_fkey" FOREIGN KEY ("affectedFeatureId") REFERENCES "features"("id") ON DELETE SET NULL ON UPDATE CASCADE;
