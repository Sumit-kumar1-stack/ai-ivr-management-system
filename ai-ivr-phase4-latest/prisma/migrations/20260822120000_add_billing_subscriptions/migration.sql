DO $$
BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM (
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELLED',
    'SUSPENDED',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SubscriptionPlanTier" AS ENUM (
    'STANDARD',
    'PREMIUM',
    'ENTERPRISE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SubscriptionEventStatus" AS ENUM (
    'RECEIVED',
    'APPLIED',
    'IGNORED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TenantSubscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" TEXT,
  "providerCustomerId" TEXT,
  "providerSubscriptionId" TEXT,
  "providerPriceId" TEXT,
  "contractReference" TEXT,
  "planTier" "SubscriptionPlanTier" NOT NULL DEFAULT 'STANDARD',
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "entitlements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "lastProviderEventId" TEXT,
  "lastProviderEventType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantSubscription_tenantId_key" UNIQUE ("tenantId"),
  CONSTRAINT "TenantSubscription_providerSubscriptionId_key" UNIQUE ("providerSubscriptionId")
);

CREATE TABLE IF NOT EXISTS "TenantPaymentEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" "SubscriptionEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload" JSONB NOT NULL,
  "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "skippedReason" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenantPaymentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantPaymentEvent_providerEventId_key" UNIQUE ("providerEventId")
);

CREATE INDEX IF NOT EXISTS "TenantSubscription_status_idx"
ON "TenantSubscription" ("status");

CREATE INDEX IF NOT EXISTS "TenantSubscription_planTier_idx"
ON "TenantSubscription" ("planTier");

CREATE INDEX IF NOT EXISTS "TenantSubscription_providerSubscriptionId_idx"
ON "TenantSubscription" ("providerSubscriptionId");

CREATE INDEX IF NOT EXISTS "TenantPaymentEvent_tenantId_idx"
ON "TenantPaymentEvent" ("tenantId");

CREATE INDEX IF NOT EXISTS "TenantPaymentEvent_subscriptionId_idx"
ON "TenantPaymentEvent" ("subscriptionId");

CREATE INDEX IF NOT EXISTS "TenantPaymentEvent_provider_idx"
ON "TenantPaymentEvent" ("provider");

CREATE INDEX IF NOT EXISTS "TenantPaymentEvent_eventType_idx"
ON "TenantPaymentEvent" ("eventType");

CREATE INDEX IF NOT EXISTS "TenantPaymentEvent_status_idx"
ON "TenantPaymentEvent" ("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TenantSubscription_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantSubscription"
    ADD CONSTRAINT "TenantSubscription_tenantId_fkey"
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
    WHERE conname = 'TenantPaymentEvent_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantPaymentEvent"
    ADD CONSTRAINT "TenantPaymentEvent_tenantId_fkey"
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
    WHERE conname = 'TenantPaymentEvent_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "TenantPaymentEvent"
    ADD CONSTRAINT "TenantPaymentEvent_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId")
    REFERENCES "TenantSubscription"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "TenantSubscription" (
  "id",
  "tenantId",
  "provider",
  "planTier",
  "status",
  "entitlements",
  "createdAt",
  "updatedAt"
)
SELECT
  'sub_' || md5(t."id" || ':' || t."slug") AS "id",
  t."id" AS "tenantId",
  NULL AS "provider",
  'STANDARD'::"SubscriptionPlanTier" AS "planTier",
  'TRIALING'::"SubscriptionStatus" AS "status",
  ARRAY[]::TEXT[] AS "entitlements",
  CURRENT_TIMESTAMP AS "createdAt",
  CURRENT_TIMESTAMP AS "updatedAt"
FROM "Tenant" t
LEFT JOIN "TenantSubscription" s
  ON s."tenantId" = t."id"
WHERE s."id" IS NULL
ON CONFLICT ("tenantId") DO NOTHING;
