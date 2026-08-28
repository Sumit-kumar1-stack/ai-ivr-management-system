-- Usage units only: no provider price, transcript, API key, or auth token.
CREATE TABLE IF NOT EXISTS "StandardRuntimeUsage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "turnId" INTEGER NOT NULL,
  "runtime" TEXT NOT NULL DEFAULT 'STANDARD',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "sttProvider" TEXT,
  "sttAudioSeconds" DOUBLE PRECISION,
  "llmProvider" TEXT,
  "llmModel" TEXT,
  "llmInputTokens" INTEGER,
  "llmOutputTokens" INTEGER,
  "ttsProvider" TEXT,
  "ttsCharacters" INTEGER NOT NULL DEFAULT 0,
  "ttsAudioSeconds" DOUBLE PRECISION,
  "ttsRequestCount" INTEGER NOT NULL DEFAULT 0,
  "ragRetrievalCount" INTEGER NOT NULL DEFAULT 0,
  "rerankerCount" INTEGER NOT NULL DEFAULT 0,
  "rerankerTimeoutCount" INTEGER NOT NULL DEFAULT 0,
  "toolInvocationCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StandardRuntimeUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StandardRuntimeUsage_callId_turnId_key" ON "StandardRuntimeUsage"("callId", "turnId");
CREATE INDEX IF NOT EXISTS "StandardRuntimeUsage_tenantId_runtime_startedAt_idx" ON "StandardRuntimeUsage"("tenantId", "runtime", "startedAt");
CREATE INDEX IF NOT EXISTS "StandardRuntimeUsage_callId_idx" ON "StandardRuntimeUsage"("callId");
ALTER TABLE "StandardRuntimeUsage" ADD CONSTRAINT "StandardRuntimeUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StandardRuntimeUsage" ADD CONSTRAINT "StandardRuntimeUsage_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
