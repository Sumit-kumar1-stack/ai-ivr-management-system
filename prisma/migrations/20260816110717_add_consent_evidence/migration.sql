-- CreateEnum
CREATE TYPE "ConsentEvidenceAction" AS ENUM ('OPT_IN', 'OPT_OUT');

-- CreateTable
CREATE TABLE "ConsentEvidence" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "action" "ConsentEvidenceAction" NOT NULL,
    "source" TEXT NOT NULL,
    "callId" TEXT,
    "requestedBy" TEXT,
    "evidenceText" TEXT,
    "previousStatus" "MessageConsentStatus",
    "resultingStatus" "MessageConsentStatus" NOT NULL,
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentEvidence_idempotencyKey_key" ON "ConsentEvidence"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ConsentEvidence_phone_idx" ON "ConsentEvidence"("phone");

-- CreateIndex
CREATE INDEX "ConsentEvidence_channel_idx" ON "ConsentEvidence"("channel");

-- CreateIndex
CREATE INDEX "ConsentEvidence_action_idx" ON "ConsentEvidence"("action");

-- CreateIndex
CREATE INDEX "ConsentEvidence_callId_idx" ON "ConsentEvidence"("callId");

-- CreateIndex
CREATE INDEX "ConsentEvidence_occurredAt_idx" ON "ConsentEvidence"("occurredAt");

-- CreateIndex
CREATE INDEX "ConsentEvidence_phone_channel_occurredAt_idx" ON "ConsentEvidence"("phone", "channel", "occurredAt");
