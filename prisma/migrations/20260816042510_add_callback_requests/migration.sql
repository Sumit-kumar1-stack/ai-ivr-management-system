-- CreateEnum
CREATE TYPE "OutboundCampaignPurpose" AS ENUM ('GENERAL', 'REMINDER', 'CALLBACK', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "CallbackRequestStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "purpose" "OutboundCampaignPurpose" NOT NULL DEFAULT 'GENERAL';

-- CreateTable
CREATE TABLE "CallbackRequest" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "reason" TEXT,
    "status" "CallbackRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallbackRequest_idempotencyKey_key" ON "CallbackRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CallbackRequest_callId_idx" ON "CallbackRequest"("callId");

-- CreateIndex
CREATE INDEX "CallbackRequest_phone_idx" ON "CallbackRequest"("phone");

-- CreateIndex
CREATE INDEX "CallbackRequest_scheduledFor_idx" ON "CallbackRequest"("scheduledFor");

-- CreateIndex
CREATE INDEX "CallbackRequest_status_idx" ON "CallbackRequest"("status");

-- CreateIndex
CREATE INDEX "CallbackRequest_createdAt_idx" ON "CallbackRequest"("createdAt");
