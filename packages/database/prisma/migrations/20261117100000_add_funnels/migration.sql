-- CreateTable
CREATE TABLE "funnels" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funnels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funnel_steps" (
    "id" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funnel_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funnels_projectId_idx" ON "funnels"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "funnel_steps_funnelId_stepOrder_key" ON "funnel_steps"("funnelId", "stepOrder");

-- CreateIndex
CREATE INDEX "funnel_steps_funnelId_idx" ON "funnel_steps"("funnelId");

-- AddForeignKey
ALTER TABLE "funnels" ADD CONSTRAINT "funnels_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funnel_steps" ADD CONSTRAINT "funnel_steps_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "funnels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
