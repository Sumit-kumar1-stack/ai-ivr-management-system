-- CreateEnum
CREATE TYPE "CommunicationTier" AS ENUM ('STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('SMS', 'WHATSAPP', 'AI_VOICE', 'IVR');

-- CreateEnum
CREATE TYPE "CommunicationFallbackPolicy" AS ENUM ('NONE', 'WHATSAPP_TO_SMS', 'OMNICHANNEL');

-- CreateEnum
CREATE TYPE "CommunicationCampaignStatus" AS ENUM ('DRAFT', 'READY', 'SCHEDULED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CommunicationCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audienceSourceId" TEXT,
    "audienceSourceName" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "tier" "CommunicationTier" NOT NULL DEFAULT 'STANDARD',
    "channels" "CommunicationChannel"[],
    "smartChanneling" BOOLEAN NOT NULL DEFAULT false,
    "fallbackPolicy" "CommunicationFallbackPolicy" NOT NULL DEFAULT 'NONE',
    "status" "CommunicationCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "launchImmediately" BOOLEAN NOT NULL DEFAULT true,
    "scheduledAt" TIMESTAMP(3),
    "voiceCampaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationCampaign_voiceCampaignId_key" ON "CommunicationCampaign"("voiceCampaignId");

-- CreateIndex
CREATE INDEX "CommunicationCampaign_status_idx" ON "CommunicationCampaign"("status");

-- CreateIndex
CREATE INDEX "CommunicationCampaign_tier_idx" ON "CommunicationCampaign"("tier");

-- CreateIndex
CREATE INDEX "CommunicationCampaign_scheduledAt_idx" ON "CommunicationCampaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "CommunicationCampaign_createdAt_idx" ON "CommunicationCampaign"("createdAt");

-- AddForeignKey
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_voiceCampaignId_fkey" FOREIGN KEY ("voiceCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
