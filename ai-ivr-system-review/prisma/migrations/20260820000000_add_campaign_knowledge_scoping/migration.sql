-- Create campaign-scoped knowledge attachment table
CREATE TABLE "CampaignKnowledgeDocument" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "knowledgeDocumentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignKnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignKnowledgeDocument_campaignId_knowledgeDocumentId_key"
    ON "CampaignKnowledgeDocument"("campaignId", "knowledgeDocumentId");

CREATE INDEX "CampaignKnowledgeDocument_campaignId_idx"
    ON "CampaignKnowledgeDocument"("campaignId");

CREATE INDEX "CampaignKnowledgeDocument_knowledgeDocumentId_idx"
    ON "CampaignKnowledgeDocument"("knowledgeDocumentId");

ALTER TABLE "CampaignKnowledgeDocument"
    ADD CONSTRAINT "CampaignKnowledgeDocument_campaignId_fkey"
    FOREIGN KEY ("campaignId")
    REFERENCES "Campaign"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "CampaignKnowledgeDocument"
    ADD CONSTRAINT "CampaignKnowledgeDocument_knowledgeDocumentId_fkey"
    FOREIGN KEY ("knowledgeDocumentId")
    REFERENCES "KnowledgeDocument"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
