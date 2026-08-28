/*
  Warnings:

  - A unique constraint covering the columns `[campaignRunId,contactId]` on the table `Call` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[documentId,chunkIndex]` on the table `KnowledgeChunk` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CampaignRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallEventType" AS ENUM ('STARTED', 'RINGING', 'ANSWERED', 'THINKING', 'SPEAKING', 'LISTENING', 'INTERRUPTED', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'QUEUED';
ALTER TYPE "CampaignStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "campaignRunId" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CampaignRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "CampaignRunStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "successful" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "type" "CallEventType" NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignRun_campaignId_idx" ON "CampaignRun"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignRun_campaignId_status_idx" ON "CampaignRun"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignRun_status_idx" ON "CampaignRun"("status");

-- CreateIndex
CREATE INDEX "CallEvent_callId_idx" ON "CallEvent"("callId");

-- CreateIndex
CREATE INDEX "CallEvent_type_idx" ON "CallEvent"("type");

-- CreateIndex
CREATE INDEX "CallEvent_createdAt_idx" ON "CallEvent"("createdAt");

-- CreateIndex
CREATE INDEX "CallEvent_callId_createdAt_idx" ON "CallEvent"("callId", "createdAt");

-- CreateIndex
CREATE INDEX "Call_campaignId_idx" ON "Call"("campaignId");

-- CreateIndex
CREATE INDEX "Call_campaignRunId_idx" ON "Call"("campaignRunId");

-- CreateIndex
CREATE INDEX "Call_contactId_idx" ON "Call"("contactId");

-- CreateIndex
CREATE INDEX "Call_providerCallId_idx" ON "Call"("providerCallId");

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");

-- CreateIndex
CREATE INDEX "Call_createdAt_idx" ON "Call"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Call_campaignRunId_contactId_key" ON "Call"("campaignRunId", "contactId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_scheduledAt_idx" ON "Campaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "Campaign"("createdAt");

-- CreateIndex
CREATE INDEX "CampaignContact_campaignId_idx" ON "CampaignContact"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignContact_contactId_idx" ON "CampaignContact"("contactId");

-- CreateIndex
CREATE INDEX "Contact_status_idx" ON "Contact"("status");

-- CreateIndex
CREATE INDEX "Contact_createdAt_idx" ON "Contact"("createdAt");

-- CreateIndex
CREATE INDEX "Conversation_createdAt_idx" ON "Conversation"("createdAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_idx" ON "ConversationMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_role_idx" ON "ConversationMessage"("role");

-- CreateIndex
CREATE INDEX "IVRFlow_campaignId_idx" ON "IVRFlow"("campaignId");

-- CreateIndex
CREATE INDEX "IVRFlow_isPublished_idx" ON "IVRFlow"("isPublished");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_documentId_chunkIndex_key" ON "KnowledgeChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_uploadedAt_idx" ON "KnowledgeDocument"("uploadedAt");

-- AddForeignKey
ALTER TABLE "CampaignRun" ADD CONSTRAINT "CampaignRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_campaignRunId_fkey" FOREIGN KEY ("campaignRunId") REFERENCES "CampaignRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
