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

DO $$
BEGIN
  CREATE TYPE "ApiKeyStatus" AS ENUM (
    'ACTIVE',
    'REVOKED',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WebhookEndpointStatus" AS ENUM (
    'ACTIVE',
    'PAUSED',
    'REVOKED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WebhookDeliveryStatus" AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED',
    'SKIPPED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- AuditEvent
-- ============================================================

CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorRole" "UserRole",
  "actorType" TEXT DEFAULT 'USER',
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "action" TEXT NOT NULL,
  "outcome" "AuditEventOutcome" NOT NULL,
  "result" TEXT,
  "reason" TEXT,
  "ipAddress" TEXT,
  "correlationId" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- AuditEvent may already exist from
-- 20260822130000_add_audit_events.
-- CREATE TABLE IF NOT EXISTS does not add newly introduced columns,
-- therefore add them explicitly and safely.

ALTER TABLE "AuditEvent"
ADD COLUMN IF NOT EXISTS "actorType" TEXT DEFAULT 'USER';

ALTER TABLE "AuditEvent"
ADD COLUMN IF NOT EXISTS "resourceType" TEXT;

ALTER TABLE "AuditEvent"
ADD COLUMN IF NOT EXISTS "resourceId" TEXT;

ALTER TABLE "AuditEvent"
ADD COLUMN IF NOT EXISTS "result" TEXT;

ALTER TABLE "AuditEvent"
ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;

ALTER TABLE "AuditEvent"
ADD COLUMN IF NOT EXISTS "correlationId" TEXT;


-- ============================================================
-- ApiKey
-- ============================================================

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);


-- ============================================================
-- WebhookEndpoint
-- ============================================================

CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT,
  "secretHash" TEXT NOT NULL,
  "secretPrefix" TEXT NOT NULL,
  "events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "WebhookEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastDeliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);


-- ============================================================
-- WebhookDelivery
-- ============================================================

CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "requestPayload" JSONB NOT NULL,
  "responseStatus" INTEGER,
  "responseBody" TEXT,
  "errorMessage" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);


-- ============================================================
-- AuditEvent indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS "AuditEvent_tenantId_idx"
ON "AuditEvent" ("tenantId");

CREATE INDEX IF NOT EXISTS "AuditEvent_actorUserId_idx"
ON "AuditEvent" ("actorUserId");

CREATE INDEX IF NOT EXISTS "AuditEvent_entityType_entityId_idx"
ON "AuditEvent" ("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "AuditEvent_resourceType_resourceId_idx"
ON "AuditEvent" ("resourceType", "resourceId");

CREATE INDEX IF NOT EXISTS "AuditEvent_action_idx"
ON "AuditEvent" ("action");

CREATE INDEX IF NOT EXISTS "AuditEvent_outcome_idx"
ON "AuditEvent" ("outcome");

CREATE INDEX IF NOT EXISTS "AuditEvent_correlationId_idx"
ON "AuditEvent" ("correlationId");

CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx"
ON "AuditEvent" ("createdAt");


-- ============================================================
-- ApiKey indexes
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_hash_key"
ON "ApiKey" ("hash");

CREATE INDEX IF NOT EXISTS "ApiKey_tenantId_idx"
ON "ApiKey" ("tenantId");

CREATE INDEX IF NOT EXISTS "ApiKey_status_idx"
ON "ApiKey" ("status");

CREATE INDEX IF NOT EXISTS "ApiKey_prefix_idx"
ON "ApiKey" ("prefix");

CREATE INDEX IF NOT EXISTS "ApiKey_expiresAt_idx"
ON "ApiKey" ("expiresAt");

CREATE INDEX IF NOT EXISTS "ApiKey_createdByUserId_idx"
ON "ApiKey" ("createdByUserId");


-- ============================================================
-- WebhookEndpoint indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS "WebhookEndpoint_tenantId_idx"
ON "WebhookEndpoint" ("tenantId");

CREATE INDEX IF NOT EXISTS "WebhookEndpoint_status_idx"
ON "WebhookEndpoint" ("status");

CREATE INDEX IF NOT EXISTS "WebhookEndpoint_createdByUserId_idx"
ON "WebhookEndpoint" ("createdByUserId");


-- ============================================================
-- WebhookDelivery indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS "WebhookDelivery_tenantId_idx"
ON "WebhookDelivery" ("tenantId");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_endpointId_idx"
ON "WebhookDelivery" ("endpointId");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_eventName_idx"
ON "WebhookDelivery" ("eventName");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_idx"
ON "WebhookDelivery" ("status");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_createdAt_idx"
ON "WebhookDelivery" ("createdAt");


-- ============================================================
-- AuditEvent foreign keys
-- ============================================================

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


-- ============================================================
-- ApiKey foreign keys
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ApiKey_tenantId_fkey'
  ) THEN
    ALTER TABLE "ApiKey"
    ADD CONSTRAINT "ApiKey_tenantId_fkey"
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
    WHERE conname = 'ApiKey_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "ApiKey"
    ADD CONSTRAINT "ApiKey_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;


-- ============================================================
-- WebhookEndpoint foreign keys
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WebhookEndpoint_tenantId_fkey'
  ) THEN
    ALTER TABLE "WebhookEndpoint"
    ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey"
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
    WHERE conname = 'WebhookEndpoint_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "WebhookEndpoint"
    ADD CONSTRAINT "WebhookEndpoint_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;


-- ============================================================
-- WebhookDelivery foreign keys
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WebhookDelivery_tenantId_fkey'
  ) THEN
    ALTER TABLE "WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_tenantId_fkey"
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
    WHERE conname = 'WebhookDelivery_endpointId_fkey'
  ) THEN
    ALTER TABLE "WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_endpointId_fkey"
    FOREIGN KEY ("endpointId")
    REFERENCES "WebhookEndpoint"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;