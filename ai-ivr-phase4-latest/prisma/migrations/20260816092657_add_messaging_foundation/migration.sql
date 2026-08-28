-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'CONTACTED', 'CONVERTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessagingChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageConsentStatus" AS ENUM ('OPTED_IN', 'OPTED_OUT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OutboundMessageStatus" AS ENUM ('PROCESSING', 'ACCEPTED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNDELIVERED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "fullName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "interest" TEXT NOT NULL,
    "notes" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'AI_IVR',
    "idempotencyKey" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageConsent" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "status" "MessageConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,
    "consentedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "callId" TEXT,
    "channel" "MessagingChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "OutboundMessageStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_idempotencyKey_key" ON "Lead"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Lead_callId_idx" ON "Lead"("callId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "MessageConsent_phone_idx" ON "MessageConsent"("phone");

-- CreateIndex
CREATE INDEX "MessageConsent_channel_idx" ON "MessageConsent"("channel");

-- CreateIndex
CREATE INDEX "MessageConsent_status_idx" ON "MessageConsent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageConsent_phone_channel_key" ON "MessageConsent"("phone", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_idempotencyKey_key" ON "OutboundMessage"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_providerMessageId_key" ON "OutboundMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "OutboundMessage_callId_idx" ON "OutboundMessage"("callId");

-- CreateIndex
CREATE INDEX "OutboundMessage_channel_idx" ON "OutboundMessage"("channel");

-- CreateIndex
CREATE INDEX "OutboundMessage_recipient_idx" ON "OutboundMessage"("recipient");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_idx" ON "OutboundMessage"("status");

-- CreateIndex
CREATE INDEX "OutboundMessage_createdAt_idx" ON "OutboundMessage"("createdAt");
