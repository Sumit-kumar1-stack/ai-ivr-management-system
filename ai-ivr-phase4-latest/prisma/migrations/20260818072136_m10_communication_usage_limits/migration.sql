-- CreateTable
CREATE TABLE "CommunicationCampaignUsage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tier" "CommunicationTier" NOT NULL,
    "usageDate" DATE NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationCampaignUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationCampaignUsage_tier_usageDate_releasedAt_idx" ON "CommunicationCampaignUsage"("tier", "usageDate", "releasedAt");

-- CreateIndex
CREATE INDEX "CommunicationCampaignUsage_campaignId_idx" ON "CommunicationCampaignUsage"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationCampaignUsage_campaignId_usageDate_key" ON "CommunicationCampaignUsage"("campaignId", "usageDate");

-- AddForeignKey
ALTER TABLE "CommunicationCampaignUsage" ADD CONSTRAINT "CommunicationCampaignUsage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
