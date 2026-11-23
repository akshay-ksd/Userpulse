-- Replace boolean `processed` with richer `processingStatus` for background event processing.
-- Add retry tracking and processing metadata fields.

-- Add new columns
ALTER TABLE "events" ADD COLUMN "processingStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "events" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "events" ADD COLUMN "processedAt" TIMESTAMPTZ(6);
ALTER TABLE "events" ADD COLUMN "processingError" TEXT;

-- Migrate existing data
UPDATE "events" SET "processingStatus" = 'PROCESSED' WHERE "processed" = true;
UPDATE "events" SET "processingStatus" = 'PENDING' WHERE "processed" = false;

-- Drop old column and index
DROP INDEX IF EXISTS "events_processed_ingestedAt_idx";
ALTER TABLE "events" DROP COLUMN "processed";

-- Create new indexes
CREATE INDEX "events_processingStatus_ingestedAt_idx" ON "events"("processingStatus", "ingestedAt");
CREATE INDEX "events_processingStatus_retryCount_idx" ON "events"("processingStatus", "retryCount");
