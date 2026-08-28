/*
  Warnings:

  - A unique constraint covering the columns `[ivrCampaignId]` on the table `CommunicationCampaign` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ivrRuntimeFlowId]` on the table `CommunicationCampaign` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CommunicationCampaign" ADD COLUMN     "ivrCampaignId" TEXT,
ADD COLUMN     "ivrFlowId" TEXT,
ADD COLUMN     "ivrRuntimeFlowId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationCampaign_ivrCampaignId_key" ON "CommunicationCampaign"("ivrCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationCampaign_ivrRuntimeFlowId_key" ON "CommunicationCampaign"("ivrRuntimeFlowId");

-- CreateIndex
CREATE INDEX "CommunicationCampaign_ivrFlowId_idx" ON "CommunicationCampaign"("ivrFlowId");

-- AddForeignKey
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_ivrCampaignId_fkey" FOREIGN KEY ("ivrCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_ivrFlowId_fkey" FOREIGN KEY ("ivrFlowId") REFERENCES "IVRFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_ivrRuntimeFlowId_fkey" FOREIGN KEY ("ivrRuntimeFlowId") REFERENCES "IVRFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
