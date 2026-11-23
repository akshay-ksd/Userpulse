-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN "supersededById" TEXT;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
