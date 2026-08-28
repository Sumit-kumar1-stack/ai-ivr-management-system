-- CreateEnum
CREATE TYPE "CommunicationRecipientStatus" AS ENUM ('PENDING', 'PROCESSING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "CommunicationCampaignStatus" ADD VALUE 'DISPATCHED';

-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "communicationCampaignId" TEXT,
ADD COLUMN     "communicationRecipientId" TEXT;

-- CreateTable
CREATE TABLE "CommunicationCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "externalRecipientId" TEXT,
    "fullName" TEXT,
    "phone" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'English',
    "status" "CommunicationRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationCampaignRecipient_campaignId_idx" ON "CommunicationCampaignRecipient"("campaignId");

-- CreateIndex
CREATE INDEX "CommunicationCampaignRecipient_phone_idx" ON "CommunicationCampaignRecipient"("phone");

-- CreateIndex
CREATE INDEX "CommunicationCampaignRecipient_status_idx" ON "CommunicationCampaignRecipient"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationCampaignRecipient_campaignId_phone_key" ON "CommunicationCampaignRecipient"("campaignId", "phone");

-- CreateIndex
CREATE INDEX "OutboundMessage_communicationCampaignId_idx" ON "OutboundMessage"("communicationCampaignId");

-- CreateIndex
CREATE INDEX "OutboundMessage_communicationRecipientId_idx" ON "OutboundMessage"("communicationRecipientId");

-- AddForeignKey
ALTER TABLE "CommunicationCampaignRecipient" ADD CONSTRAINT "CommunicationCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_communicationCampaignId_fkey" FOREIGN KEY ("communicationCampaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_communicationRecipientId_fkey" FOREIGN KEY ("communicationRecipientId") REFERENCES "CommunicationCampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
