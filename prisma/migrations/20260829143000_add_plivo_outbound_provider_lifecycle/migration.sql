-- Phase E.3: durable provider request/callback lifecycle for outbound calls.
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'PROVIDER_REQUESTING';
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'PROVIDER_ACCEPTED';
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'RINGING';
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'ANSWERED';
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'BUSY';
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'NO_ANSWER';
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'REJECTED';
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'INVALID_NUMBER';
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'PROVIDER_ERROR';
ALTER TYPE "CommunicationOutboundAttemptStatus" ADD VALUE 'CANCELED';

ALTER TABLE "CommunicationOutboundAttempt"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerRequestId" TEXT,
  ADD COLUMN "providerCallId" TEXT,
  ADD COLUMN "rawProviderStatus" TEXT,
  ADD COLUMN "rawProviderCause" TEXT,
  ADD COLUMN "requestedRuntime" TEXT,
  ADD COLUMN "effectiveRuntime" TEXT,
  ADD COLUMN "providerRequestedAt" TIMESTAMP(3),
  ADD COLUMN "providerAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "ringingAt" TIMESTAMP(3),
  ADD COLUMN "answeredAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "CommunicationOutboundAttempt_providerRequestId_key"
  ON "CommunicationOutboundAttempt"("providerRequestId");
CREATE UNIQUE INDEX "CommunicationOutboundAttempt_providerCallId_key"
  ON "CommunicationOutboundAttempt"("providerCallId");
CREATE INDEX "CommunicationOutboundAttempt_provider_status_idx"
  ON "CommunicationOutboundAttempt"("provider", "status");

ALTER TABLE "Call"
  ALTER COLUMN "campaignId" DROP NOT NULL,
  ALTER COLUMN "contactId" DROP NOT NULL,
  ADD COLUMN "communicationCampaignId" TEXT,
  ADD COLUMN "communicationOutboundAttemptId" TEXT;

CREATE UNIQUE INDEX "Call_communicationOutboundAttemptId_key"
  ON "Call"("communicationOutboundAttemptId");
CREATE INDEX "Call_communicationCampaignId_idx"
  ON "Call"("communicationCampaignId");

ALTER TABLE "Call"
  ADD CONSTRAINT "Call_communicationCampaignId_fkey"
  FOREIGN KEY ("communicationCampaignId") REFERENCES "CommunicationCampaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Call"
  ADD CONSTRAINT "Call_communicationOutboundAttemptId_fkey"
  FOREIGN KEY ("communicationOutboundAttemptId") REFERENCES "CommunicationOutboundAttempt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
