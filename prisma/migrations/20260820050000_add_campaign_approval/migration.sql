CREATE TYPE "CommunicationCampaignApprovalStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED'
);

ALTER TABLE "CommunicationCampaign"
ADD COLUMN IF NOT EXISTS "submittedByUserId" TEXT,
ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT,
ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "approvalReason" TEXT,
ADD COLUMN IF NOT EXISTS "approvalStatus" "CommunicationCampaignApprovalStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN IF NOT EXISTS "approvalRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "CommunicationCampaign_approvalStatus_idx"
ON "CommunicationCampaign" ("approvalStatus");

CREATE INDEX IF NOT EXISTS "CommunicationCampaign_submittedByUserId_idx"
ON "CommunicationCampaign" ("submittedByUserId");

CREATE INDEX IF NOT EXISTS "CommunicationCampaign_approvedByUserId_idx"
ON "CommunicationCampaign" ("approvedByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CommunicationCampaign_submittedByUserId_fkey'
  ) THEN
    ALTER TABLE "CommunicationCampaign"
    ADD CONSTRAINT "CommunicationCampaign_submittedByUserId_fkey"
    FOREIGN KEY ("submittedByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CommunicationCampaign_approvedByUserId_fkey'
  ) THEN
    ALTER TABLE "CommunicationCampaign"
    ADD CONSTRAINT "CommunicationCampaign_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
