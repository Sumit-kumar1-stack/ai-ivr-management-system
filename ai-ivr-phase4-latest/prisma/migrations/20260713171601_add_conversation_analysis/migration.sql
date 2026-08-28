-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "actionItems" JSONB,
ADD COLUMN     "followUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "intent" TEXT,
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "sentiment" TEXT;
