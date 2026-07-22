/*
  Warnings:

  - You are about to drop the column `phone` on the `Call` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Call_createdAt_idx";

-- DropIndex
DROP INDEX "Call_status_idx";

-- AlterTable
ALTER TABLE "Call" DROP COLUMN "phone",
ADD COLUMN     "contactPhoneSnapshot" TEXT,
ADD COLUMN     "destinationOverrideSource" TEXT,
ADD COLUMN     "providerDestination" TEXT,
ADD COLUMN     "usedDevelopmentOverride" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Call_providerDestination_idx" ON "Call"("providerDestination");
