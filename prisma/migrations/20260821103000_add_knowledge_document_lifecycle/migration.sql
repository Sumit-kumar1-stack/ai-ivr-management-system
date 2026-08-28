-- Add lifecycle support for knowledge documents.
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "KnowledgeDocument"
  ADD COLUMN "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "archivedAt" TIMESTAMP(3);
