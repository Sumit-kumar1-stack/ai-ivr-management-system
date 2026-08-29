-- Repair Phase B physical-schema drift without rewriting legacy callback rows.
ALTER TABLE "CallbackRequest"
  ADD COLUMN IF NOT EXISTS "originalCallId" TEXT,
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT,
  ADD COLUMN IF NOT EXISTS "contactId" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "intent" TEXT,
  ADD COLUMN IF NOT EXISTS "handoffSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

ALTER TABLE "CallbackRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS "CallbackRequest_originalCallId_idx"
  ON "CallbackRequest"("originalCallId");

CREATE INDEX IF NOT EXISTS "CallbackRequest_tenantId_status_idx"
  ON "CallbackRequest"("tenantId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "CallbackRequest_one_active_per_original_call"
  ON "CallbackRequest"("originalCallId")
  WHERE "originalCallId" IS NOT NULL
    AND "status" IN ('PENDING', 'CONFIRMED', 'CLAIMED', 'REQUESTED', 'SCHEDULED');
