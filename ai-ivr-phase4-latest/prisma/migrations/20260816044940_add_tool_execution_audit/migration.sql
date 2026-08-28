-- CreateEnum
CREATE TYPE "ToolExecutionStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED_OUT');

-- CreateTable
CREATE TABLE "ToolExecution" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "tenantId" TEXT,
    "idempotencyKey" TEXT,
    "status" "ToolExecutionStatus" NOT NULL DEFAULT 'STARTED',
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "mutating" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolExecution_callId_idx" ON "ToolExecution"("callId");

-- CreateIndex
CREATE INDEX "ToolExecution_tool_idx" ON "ToolExecution"("tool");

-- CreateIndex
CREATE INDEX "ToolExecution_status_idx" ON "ToolExecution"("status");

-- CreateIndex
CREATE INDEX "ToolExecution_createdAt_idx" ON "ToolExecution"("createdAt");

-- CreateIndex
CREATE INDEX "ToolExecution_callId_createdAt_idx" ON "ToolExecution"("callId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ToolExecution_tool_idempotencyKey_key" ON "ToolExecution"("tool", "idempotencyKey");
