-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "anonymousId" TEXT,
    "userId" TEXT,
    "properties" JSONB,
    "sdkVersion" TEXT,
    "eventTimestamp" TIMESTAMPTZ(6) NOT NULL,
    "ingestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_projectId_ingestedAt_idx" ON "events"("projectId", "ingestedAt");

-- CreateIndex
CREATE INDEX "events_processed_ingestedAt_idx" ON "events"("processed", "ingestedAt");

-- CreateIndex
CREATE INDEX "events_eventId_idx" ON "events"("eventId");
