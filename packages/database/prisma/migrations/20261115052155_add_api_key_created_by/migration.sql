/*
  Warnings:

  - Added the required column `createdBy` to the `project_api_keys` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "project_api_keys" ADD COLUMN     "createdBy" TEXT NOT NULL;
