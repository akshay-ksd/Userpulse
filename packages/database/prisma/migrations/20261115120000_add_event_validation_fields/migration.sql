-- AlterTable
ALTER TABLE "events" ADD COLUMN "validationStatus" TEXT NOT NULL DEFAULT 'VALID';
ALTER TABLE "events" ADD COLUMN "validationError" TEXT;

-- CreateIndex
CREATE INDEX "events_projectId_validationStatus_idx" ON "events"("projectId", "validationStatus");
