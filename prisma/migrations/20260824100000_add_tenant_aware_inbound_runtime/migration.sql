-- Tenant ownership is backfilled from the existing contact owner where possible.
ALTER TABLE "Contact"
ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "Contact" AS contact
SET "tenantId" = users."tenantId"
FROM "User" AS users
WHERE contact."ownerUserId" = users."id"
  AND contact."tenantId" IS NULL
  AND users."tenantId" IS NOT NULL;

ALTER TABLE "Contact"
DROP CONSTRAINT IF EXISTS "Contact_phone_key";

DROP INDEX IF EXISTS "Contact_phone_key";

CREATE INDEX IF NOT EXISTS "Contact_tenantId_idx"
ON "Contact" ("tenantId");

CREATE UNIQUE INDEX IF NOT EXISTS "Contact_tenantId_phone_key"
ON "Contact" ("tenantId", "phone");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Contact_tenantId_fkey'
  ) THEN
    ALTER TABLE "Contact"
    ADD CONSTRAINT "Contact_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "InboundProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "defaultLanguage" TEXT NOT NULL DEFAULT 'English',
  "ivrFlowId" TEXT,
  "knowledgeDocumentIds" JSONB,
  "callbackEnabled" BOOLEAN NOT NULL DEFAULT true,
  "transferEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InboundNumber" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inboundProfileId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerNumber" TEXT NOT NULL,
  "providerNumberSid" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InboundProfile_tenantId_name_key"
ON "InboundProfile" ("tenantId", "name");

CREATE INDEX IF NOT EXISTS "InboundProfile_tenantId_active_idx"
ON "InboundProfile" ("tenantId", "active");

CREATE INDEX IF NOT EXISTS "InboundProfile_ivrFlowId_idx"
ON "InboundProfile" ("ivrFlowId");

CREATE UNIQUE INDEX IF NOT EXISTS "InboundNumber_provider_providerNumber_key"
ON "InboundNumber" ("provider", "providerNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "InboundNumber_provider_providerNumberSid_key"
ON "InboundNumber" ("provider", "providerNumberSid");

CREATE INDEX IF NOT EXISTS "InboundNumber_tenantId_active_idx"
ON "InboundNumber" ("tenantId", "active");

CREATE INDEX IF NOT EXISTS "InboundNumber_inboundProfileId_active_idx"
ON "InboundNumber" ("inboundProfileId", "active");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundProfile_tenantId_fkey') THEN
    ALTER TABLE "InboundProfile"
    ADD CONSTRAINT "InboundProfile_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundProfile_ivrFlowId_fkey') THEN
    ALTER TABLE "InboundProfile"
    ADD CONSTRAINT "InboundProfile_ivrFlowId_fkey"
    FOREIGN KEY ("ivrFlowId") REFERENCES "IVRFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundNumber_tenantId_fkey') THEN
    ALTER TABLE "InboundNumber"
    ADD CONSTRAINT "InboundNumber_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundNumber_inboundProfileId_fkey') THEN
    ALTER TABLE "InboundNumber"
    ADD CONSTRAINT "InboundNumber_inboundProfileId_fkey"
    FOREIGN KEY ("inboundProfileId") REFERENCES "InboundProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Call"
ADD COLUMN IF NOT EXISTS "tenantId" TEXT,
ADD COLUMN IF NOT EXISTS "inboundProfileId" TEXT;

CREATE INDEX IF NOT EXISTS "Call_tenantId_idx"
ON "Call" ("tenantId");

CREATE INDEX IF NOT EXISTS "Call_inboundProfileId_idx"
ON "Call" ("inboundProfileId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Call_tenantId_fkey') THEN
    ALTER TABLE "Call"
    ADD CONSTRAINT "Call_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Call_inboundProfileId_fkey') THEN
    ALTER TABLE "Call"
    ADD CONSTRAINT "Call_inboundProfileId_fkey"
    FOREIGN KEY ("inboundProfileId") REFERENCES "InboundProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
