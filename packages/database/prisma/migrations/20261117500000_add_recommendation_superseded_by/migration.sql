-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN "superseded_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
