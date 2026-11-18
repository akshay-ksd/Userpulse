-- DropIndex
DROP INDEX IF EXISTS "events_event_id_idx";

-- CreateIndex (unique constraint replaces the plain index)
CREATE UNIQUE INDEX "events_project_id_event_id_key" ON "events"("project_id", "event_id");
