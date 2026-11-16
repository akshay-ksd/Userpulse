-- CreateIndex
CREATE INDEX "events_project_id_event_timestamp_idx" ON "events"("project_id", "event_timestamp");
