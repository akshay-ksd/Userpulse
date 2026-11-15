-- AlterEnum
ALTER TYPE "EventBatchStatus" ADD VALUE 'INVALID';

-- AlterTable
ALTER TABLE "event_batches" ADD COLUMN     "invalidEventCount" INTEGER,
ADD COLUMN     "invalidEvents" JSONB,
ADD COLUMN     "validEventCount" INTEGER,
ADD COLUMN     "validEvents" JSONB;
