/*
  Warnings:

  - The `status` column on the `Call` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'RINGING', 'ANSWERED', 'COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER', 'CANCELED');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT');

-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_contactId_fkey";

-- AlterTable
ALTER TABLE "Call" DROP COLUMN "status",
ADD COLUMN     "status" "CallStatus" NOT NULL DEFAULT 'QUEUED';

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "summary" TEXT,
    "tokenUsage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_callId_key" ON "Conversation"("callId");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
