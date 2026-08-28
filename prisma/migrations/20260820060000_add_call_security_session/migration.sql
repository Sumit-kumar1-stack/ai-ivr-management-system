-- Create enums
CREATE TYPE "CallAuthenticationLevel" AS ENUM ('AUTH_LEVEL_0', 'AUTH_LEVEL_1', 'AUTH_LEVEL_2', 'AUTH_LEVEL_3');
CREATE TYPE "CallRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- Add call security session fields
ALTER TABLE "Call"
  ADD COLUMN "authenticationLevel" "CallAuthenticationLevel" NOT NULL DEFAULT 'AUTH_LEVEL_0',
  ADD COLUMN "authenticationVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "riskLevel" "CallRiskLevel" NOT NULL DEFAULT 'LOW',
  ADD COLUMN "securityFlags" JSONB;

CREATE INDEX "Call_authenticationLevel_idx" ON "Call"("authenticationLevel");
CREATE INDEX "Call_riskLevel_idx" ON "Call"("riskLevel");

-- Add campaign action auth requirement
ALTER TABLE "CampaignAction"
  ADD COLUMN "requiredAuthLevel" "CallAuthenticationLevel" NOT NULL DEFAULT 'AUTH_LEVEL_0';
