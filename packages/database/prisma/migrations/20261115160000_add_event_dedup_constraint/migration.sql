-- DropIndex
DROP INDEX IF EXISTS "events_eventId_idx";

-- CreateIndex (unique constraint replaces the plain index)
CREATE UNIQUE INDEX "events_projectId_eventId_key" ON "events"("projectId", "eventId");
