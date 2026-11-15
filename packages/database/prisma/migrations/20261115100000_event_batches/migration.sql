-- CreateEnum
CREATE TYPE "EventBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "event_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "status" "EventBatchStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "event_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_batches_status_createdAt_idx" ON "event_batches"("status", "createdAt");

-- CreateIndex
CREATE INDEX "event_batches_projectId_idx" ON "event_batches"("projectId");
