-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "answeredAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "queuedAt" TIMESTAMP(3),
ADD COLUMN     "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ringingAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");

-- CreateIndex
CREATE INDEX "Call_requestedAt_idx" ON "Call"("requestedAt");

-- CreateIndex
CREATE INDEX "Call_answeredAt_idx" ON "Call"("answeredAt");

-- CreateIndex
CREATE INDEX "Call_completedAt_idx" ON "Call"("completedAt");
