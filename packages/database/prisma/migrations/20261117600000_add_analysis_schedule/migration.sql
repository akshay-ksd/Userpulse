-- CreateTable
CREATE TABLE "analysis_schedules" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "intervalHours" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMPTZ(6),
    "nextRunAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analysis_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_schedules_projectId_key" ON "analysis_schedules"("projectId");

-- CreateIndex
CREATE INDEX "analysis_schedules_enabled_nextRunAt_idx" ON "analysis_schedules"("enabled", "nextRunAt");

-- AddForeignKey
ALTER TABLE "analysis_schedules" ADD CONSTRAINT "analysis_schedules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
