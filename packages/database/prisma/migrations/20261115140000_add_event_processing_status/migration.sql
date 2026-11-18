-- Replace boolean `processed` with richer `processingStatus` for background event processing.
-- Add retry tracking and processing metadata fields.

-- Add new columns
ALTER TABLE "events" ADD COLUMN "processing_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "events" ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "events" ADD COLUMN "processed_at" TIMESTAMPTZ(6);
ALTER TABLE "events" ADD COLUMN "processing_error" TEXT;

-- Migrate existing data
UPDATE "events" SET "processing_status" = 'PROCESSED' WHERE "processed" = true;
UPDATE "events" SET "processing_status" = 'PENDING' WHERE "processed" = false;

-- Drop old column and index
DROP INDEX IF EXISTS "events_processed_ingested_at_idx";
ALTER TABLE "events" DROP COLUMN "processed";

-- Create new indexes
CREATE INDEX "events_processing_status_ingested_at_idx" ON "events"("processing_status", "ingested_at");
CREATE INDEX "events_processing_status_retry_count_idx" ON "events"("processing_status", "retry_count");
