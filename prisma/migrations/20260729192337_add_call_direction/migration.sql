/*
  Warnings:

  - A unique constraint covering the columns `[systemKey]` on the table `Campaign` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "calledNumber" TEXT,
ADD COLUMN     "callerNumber" TEXT,
ADD COLUMN     "direction" "CallDirection" NOT NULL DEFAULT 'OUTBOUND';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "systemKey" TEXT;

-- CreateIndex
CREATE INDEX "Call_direction_idx" ON "Call"("direction");

-- CreateIndex
CREATE INDEX "Call_callerNumber_idx" ON "Call"("callerNumber");

-- CreateIndex
CREATE INDEX "Call_calledNumber_idx" ON "Call"("calledNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_systemKey_key" ON "Campaign"("systemKey");
