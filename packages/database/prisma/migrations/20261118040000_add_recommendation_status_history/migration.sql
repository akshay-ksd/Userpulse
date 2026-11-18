-- CreateTable
CREATE TABLE "recommendation_status_history" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_status_history_recommendationId_createdAt_idx" ON "recommendation_status_history"("recommendationId", "createdAt");

-- AddForeignKey
ALTER TABLE "recommendation_status_history" ADD CONSTRAINT "recommendation_status_history_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
