ALTER TABLE "InboundProfile"
  ADD COLUMN IF NOT EXISTS "voiceRuntime" TEXT NOT NULL DEFAULT 'CASCADED';

ALTER TABLE "Call"
  ADD COLUMN IF NOT EXISTS "requestedRuntime" TEXT,
  ADD COLUMN IF NOT EXISTS "effectiveRuntime" TEXT,
  ADD COLUMN IF NOT EXISTS "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fallbackReason" TEXT;

CREATE INDEX IF NOT EXISTS "Call_requestedRuntime_idx"
  ON "Call"("requestedRuntime");
