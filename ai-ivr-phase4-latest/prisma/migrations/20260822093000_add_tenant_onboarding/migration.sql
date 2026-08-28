DO $$
BEGIN
  CREATE TYPE "AccountStatus" AS ENUM (
    'PENDING_VERIFICATION',
    'ACTIVE',
    'SUSPENDED',
    'LOCKED',
    'DEACTIVATED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TenantStatus" AS ENUM (
    'PENDING',
    'TRIAL',
    'ACTIVE',
    'PAST_DUE',
    'SUSPENDED',
    'TERMINATED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TenantInvitationStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'EXPIRED',
    'REVOKED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT,
  ADD COLUMN IF NOT EXISTS "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invitedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_tenantId_idx"
ON "User" ("tenantId");

CREATE INDEX IF NOT EXISTS "User_accountStatus_idx"
ON "User" ("accountStatus");

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'PENDING',
  "ownerUserId" TEXT,
  "activatedAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "terminatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TenantInvitation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "fullName" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
  "status" "TenantInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "acceptedByUserId" TEXT,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenantInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key"
ON "Tenant" ("slug");

CREATE INDEX IF NOT EXISTS "Tenant_status_idx"
ON "Tenant" ("status");

CREATE INDEX IF NOT EXISTS "Tenant_ownerUserId_idx"
ON "Tenant" ("ownerUserId");

CREATE UNIQUE INDEX IF NOT EXISTS "TenantInvitation_tokenHash_key"
ON "TenantInvitation" ("tokenHash");

CREATE INDEX IF NOT EXISTS "TenantInvitation_tenantId_idx"
ON "TenantInvitation" ("tenantId");

CREATE INDEX IF NOT EXISTS "TenantInvitation_email_idx"
ON "TenantInvitation" ("email");

CREATE INDEX IF NOT EXISTS "TenantInvitation_status_idx"
ON "TenantInvitation" ("status");

CREATE INDEX IF NOT EXISTS "TenantInvitation_expiresAt_idx"
ON "TenantInvitation" ("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Tenant_ownerUserId_fkey'
  ) THEN
    ALTER TABLE "Tenant"
    ADD CONSTRAINT "Tenant_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_tenantId_fkey'
  ) THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_invitedByUserId_fkey'
  ) THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TenantInvitation_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantInvitation"
    ADD CONSTRAINT "TenantInvitation_tenantId_fkey"
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
    WHERE conname = 'TenantInvitation_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "TenantInvitation"
    ADD CONSTRAINT "TenantInvitation_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TenantInvitation_acceptedByUserId_fkey'
  ) THEN
    ALTER TABLE "TenantInvitation"
    ADD CONSTRAINT "TenantInvitation_acceptedByUserId_fkey"
    FOREIGN KEY ("acceptedByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
