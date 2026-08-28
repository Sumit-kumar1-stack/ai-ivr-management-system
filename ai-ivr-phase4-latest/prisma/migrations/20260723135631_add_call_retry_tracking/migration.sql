/*
  Warnings:

  - A unique constraint covering the columns `[providerCallId]` on the table `Call` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[campaignRunId,contactId,attemptNumber]` on the table `Call` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_contactId_fkey";

-- DropIndex
DROP INDEX "Call_campaignRunId_contactId_key";

-- DropIndex
DROP INDEX "Call_providerCallId_idx";

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "retryOfCallId" TEXT,
ADD COLUMN     "retryReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Call_providerCallId_key" ON "Call"("providerCallId");

-- CreateIndex
CREATE INDEX "Call_campaignRunId_contactId_idx" ON "Call"("campaignRunId", "contactId");

-- CreateIndex
CREATE INDEX "Call_retryOfCallId_idx" ON "Call"("retryOfCallId");

-- CreateIndex
CREATE INDEX "Call_nextRetryAt_idx" ON "Call"("nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "Call_campaignRunId_contactId_attemptNumber_key" ON "Call"("campaignRunId", "contactId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_retryOfCallId_fkey" FOREIGN KEY ("retryOfCallId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
