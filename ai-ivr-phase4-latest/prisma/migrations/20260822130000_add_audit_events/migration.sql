DO $$
BEGIN
  CREATE TYPE "AuditEventOutcome" AS ENUM (
    'SUCCEEDED',
    'DENIED',
    'FAILED',
    'SKIPPED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorRole" "UserRole",
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "action" TEXT NOT NULL,
  "outcome" "AuditEventOutcome" NOT NULL,
  "reason" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditEvent_tenantId_idx"
ON "AuditEvent" ("tenantId");

CREATE INDEX IF NOT EXISTS "AuditEvent_actorUserId_idx"
ON "AuditEvent" ("actorUserId");

CREATE INDEX IF NOT EXISTS "AuditEvent_entityType_entityId_idx"
ON "AuditEvent" ("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "AuditEvent_action_idx"
ON "AuditEvent" ("action");

CREATE INDEX IF NOT EXISTS "AuditEvent_outcome_idx"
ON "AuditEvent" ("outcome");

CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx"
ON "AuditEvent" ("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AuditEvent_tenantId_fkey'
  ) THEN
    ALTER TABLE "AuditEvent"
    ADD CONSTRAINT "AuditEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AuditEvent_actorUserId_fkey'
  ) THEN
    ALTER TABLE "AuditEvent"
    ADD CONSTRAINT "AuditEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
