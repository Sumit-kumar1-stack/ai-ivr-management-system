ALTER TYPE "CommunicationCampaignStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "CommunicationCampaign"
  ADD COLUMN IF NOT EXISTS "currentRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "approvedRevision" INTEGER,
  ADD COLUMN IF NOT EXISTS "attemptedContactCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "CommunicationCampaign_archivedByUserId_idx"
ON "CommunicationCampaign" ("archivedByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CommunicationCampaign_archivedByUserId_fkey'
  ) THEN
    ALTER TABLE "CommunicationCampaign"
    ADD CONSTRAINT "CommunicationCampaign_archivedByUserId_fkey"
    FOREIGN KEY ("archivedByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
