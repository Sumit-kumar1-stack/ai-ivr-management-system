-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "KnowledgeDocumentClassification" AS ENUM (
    'PUBLIC_PRODUCT_INFO',
    'INTERNAL',
    'CUSTOMER_PERSONAL',
    'SENSITIVE',
    'RESTRICTED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "KnowledgeDocument"
ADD COLUMN IF NOT EXISTS "classification" "KnowledgeDocumentClassification" NOT NULL DEFAULT 'INTERNAL';
