-- CreateIndex
CREATE INDEX "events_projectId_eventTimestamp_idx" ON "events"("projectId", "eventTimestamp");
