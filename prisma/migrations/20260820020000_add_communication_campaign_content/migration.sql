ALTER TABLE "CommunicationCampaign"
ADD COLUMN "description" TEXT,
ADD COLUMN "prompt" TEXT,
ADD COLUMN "knowledgeDocumentIds" JSONB;
