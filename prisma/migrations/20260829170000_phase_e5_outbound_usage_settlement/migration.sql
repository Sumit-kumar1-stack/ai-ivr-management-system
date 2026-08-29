-- Phase E.5: durable, idempotent outbound-attempt usage settlement.
ALTER TABLE "CommunicationOutboundAttempt"
  ADD COLUMN "usageSettledAt" TIMESTAMP(3),
  ADD COLUMN "usageProviderAccepted" BOOLEAN,
  ADD COLUMN "usageConnected" BOOLEAN,
  ADD COLUMN "usageDurationSeconds" INTEGER;

CREATE INDEX "CommunicationOutboundAttempt_tenantId_usageSettledAt_idx"
  ON "CommunicationOutboundAttempt"("tenantId", "usageSettledAt");
