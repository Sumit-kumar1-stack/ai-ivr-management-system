ALTER TABLE "CommunicationCampaign"
ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "CommunicationCampaign"
ADD CONSTRAINT "CommunicationCampaign_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CommunicationCampaign_ownerUserId_idx"
ON "CommunicationCampaign"("ownerUserId");
