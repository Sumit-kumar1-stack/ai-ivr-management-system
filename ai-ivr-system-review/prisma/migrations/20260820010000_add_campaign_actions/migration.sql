-- CreateEnum
CREATE TYPE "CampaignActionType" AS ENUM ('MOCK', 'WEBHOOK');

-- CreateTable
CREATE TABLE "CampaignAction" (
    "id" TEXT NOT NULL,
    "communicationCampaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actionCode" TEXT NOT NULL,
    "type" "CampaignActionType" NOT NULL DEFAULT 'MOCK',
    "endpoint" TEXT,
    "integrationRef" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignAction_communicationCampaignId_idx" ON "CampaignAction"("communicationCampaignId");

-- CreateIndex
CREATE INDEX "CampaignAction_actionCode_idx" ON "CampaignAction"("actionCode");

-- CreateIndex
CREATE INDEX "CampaignAction_enabled_idx" ON "CampaignAction"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAction_communicationCampaignId_actionCode_key" ON "CampaignAction"("communicationCampaignId", "actionCode");

-- AddForeignKey
ALTER TABLE "CampaignAction" ADD CONSTRAINT "CampaignAction_communicationCampaignId_fkey" FOREIGN KEY ("communicationCampaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
