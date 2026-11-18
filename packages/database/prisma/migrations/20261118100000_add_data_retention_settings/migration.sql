-- CreateTable
CREATE TABLE "data_retention_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_retention_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_retention_settings_organizationId_key" ON "data_retention_settings"("organizationId");

-- AddForeignKey
ALTER TABLE "data_retention_settings" ADD CONSTRAINT "data_retention_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
