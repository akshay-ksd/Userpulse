-- CreateTable
CREATE TABLE "feature_event_mappings" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_event_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feature_event_mappings_featureId_idx" ON "feature_event_mappings"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_event_mappings_projectId_eventName_key" ON "feature_event_mappings"("projectId", "eventName");

-- AddForeignKey
ALTER TABLE "feature_event_mappings" ADD CONSTRAINT "feature_event_mappings_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_event_mappings" ADD CONSTRAINT "feature_event_mappings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
