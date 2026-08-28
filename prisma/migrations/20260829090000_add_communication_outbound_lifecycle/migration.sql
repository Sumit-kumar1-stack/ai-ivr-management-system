ALTER TYPE "CommunicationCampaignStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

CREATE TYPE "CommunicationOutboundAttemptStatus" AS ENUM (
  'QUEUED',
  'CLAIMED',
  'COMPLETED',
  'FAILED',
  'SKIPPED'
);

ALTER TABLE "CommunicationCampaign"
  ADD COLUMN "concurrencyLimit" INTEGER,
  ADD COLUMN "outboundProvider" TEXT,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "businessHoursPolicy" JSONB;

ALTER TABLE "CommunicationCampaignRecipient"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "consentStatus" TEXT NOT NULL DEFAULT 'OPTED_IN',
  ADD COLUMN "dnc" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suppressed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "timezone" TEXT;

CREATE TABLE "CommunicationOutboundAttempt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "campaignRecipientId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "CommunicationOutboundAttemptStatus" NOT NULL DEFAULT 'QUEUED',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunicationOutboundAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunicationOutboundCapacityLease" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationOutboundCapacityLease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunicationOutboundAttempt_campaignRecipientId_attemptNumber_key"
  ON "CommunicationOutboundAttempt"("campaignRecipientId", "attemptNumber");
CREATE INDEX "CommunicationOutboundAttempt_tenantId_status_idx"
  ON "CommunicationOutboundAttempt"("tenantId", "status");
CREATE INDEX "CommunicationOutboundAttempt_campaignId_status_idx"
  ON "CommunicationOutboundAttempt"("campaignId", "status");
CREATE INDEX "CommunicationOutboundAttempt_scheduledFor_status_idx"
  ON "CommunicationOutboundAttempt"("scheduledFor", "status");

CREATE UNIQUE INDEX "CommunicationOutboundCapacityLease_attemptId_key"
  ON "CommunicationOutboundCapacityLease"("attemptId");
CREATE INDEX "CommunicationOutboundCapacityLease_tenantId_expiresAt_idx"
  ON "CommunicationOutboundCapacityLease"("tenantId", "expiresAt");
CREATE INDEX "CommunicationOutboundCapacityLease_campaignId_expiresAt_idx"
  ON "CommunicationOutboundCapacityLease"("campaignId", "expiresAt");
CREATE INDEX "CommunicationOutboundCapacityLease_provider_expiresAt_idx"
  ON "CommunicationOutboundCapacityLease"("provider", "expiresAt");
CREATE INDEX "CommunicationOutboundCapacityLease_expiresAt_idx"
  ON "CommunicationOutboundCapacityLease"("expiresAt");

ALTER TABLE "CommunicationOutboundAttempt"
  ADD CONSTRAINT "CommunicationOutboundAttempt_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunicationOutboundAttempt"
  ADD CONSTRAINT "CommunicationOutboundAttempt_campaignRecipientId_fkey"
  FOREIGN KEY ("campaignRecipientId") REFERENCES "CommunicationCampaignRecipient"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunicationOutboundCapacityLease"
  ADD CONSTRAINT "CommunicationOutboundCapacityLease_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "CommunicationOutboundAttempt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunicationOutboundCapacityLease"
  ADD CONSTRAINT "CommunicationOutboundCapacityLease_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
