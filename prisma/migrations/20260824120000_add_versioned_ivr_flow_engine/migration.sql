-- Keep existing IVRFlow rows as Builder drafts and create immutable runtime snapshots.
CREATE TYPE "IVRFlowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "IVRFlow" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "InboundProfile" ADD COLUMN "ivrFlowVersionId" TEXT;
ALTER TABLE "CommunicationCampaign" ADD COLUMN "ivrFlowVersionId" TEXT;
ALTER TABLE "Call" ADD COLUMN "ivrFlowVersionId" TEXT;

CREATE TABLE "IVRFlowVersion" (
  "id" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "tenantId" TEXT,
  "versionNumber" INTEGER NOT NULL,
  "status" "IVRFlowVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "nodes" JSONB NOT NULL,
  "edges" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IVRFlowVersion_pkey" PRIMARY KEY ("id")
);

-- Existing flow ownership is the authoritative tenant source for the backfill.
UPDATE "IVRFlow" flow
SET "tenantId" = owner."tenantId"
FROM "User" owner
WHERE flow."ownerUserId" = owner."id"
  AND flow."tenantId" IS NULL;

INSERT INTO "IVRFlowVersion" (
  "id", "flowId", "tenantId", "versionNumber", "status", "nodes", "edges",
  "contentHash", "createdByUserId", "publishedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy-version-' || flow."id",
  flow."id",
  flow."tenantId",
  flow."version",
  CASE WHEN flow."isPublished" THEN 'PUBLISHED'::"IVRFlowVersionStatus" ELSE 'DRAFT'::"IVRFlowVersionStatus" END,
  flow."nodes",
  flow."edges",
  'legacy:' || flow."id" || ':' || flow."version"::TEXT,
  flow."ownerUserId",
  CASE WHEN flow."isPublished" THEN flow."updatedAt" ELSE NULL END,
  flow."createdAt",
  flow."updatedAt"
FROM "IVRFlow" flow;

UPDATE "InboundProfile" profile
SET "ivrFlowVersionId" = version."id"
FROM "IVRFlowVersion" version
WHERE profile."ivrFlowId" = version."flowId"
  AND version."status" = 'PUBLISHED';

UPDATE "CommunicationCampaign" campaign
SET "ivrFlowVersionId" = version."id"
FROM "IVRFlowVersion" version
WHERE campaign."ivrFlowId" = version."flowId"
  AND version."status" = 'PUBLISHED';

UPDATE "Call" call_record
SET "ivrFlowVersionId" = profile."ivrFlowVersionId"
FROM "InboundProfile" profile
WHERE call_record."inboundProfileId" = profile."id"
  AND call_record."ivrFlowVersionId" IS NULL;

UPDATE "Call" call_record
SET "ivrFlowVersionId" = campaign."ivrFlowVersionId"
FROM "CommunicationCampaign" campaign
WHERE campaign."voiceCampaignId" = call_record."campaignId"
  AND call_record."ivrFlowVersionId" IS NULL;

CREATE UNIQUE INDEX "IVRFlowVersion_flowId_versionNumber_key" ON "IVRFlowVersion"("flowId", "versionNumber");
CREATE INDEX "IVRFlow_tenantId_idx" ON "IVRFlow"("tenantId");
CREATE INDEX "IVRFlowVersion_tenantId_status_idx" ON "IVRFlowVersion"("tenantId", "status");
CREATE INDEX "IVRFlowVersion_flowId_status_idx" ON "IVRFlowVersion"("flowId", "status");
CREATE INDEX "InboundProfile_ivrFlowVersionId_idx" ON "InboundProfile"("ivrFlowVersionId");
CREATE INDEX "CommunicationCampaign_ivrFlowVersionId_idx" ON "CommunicationCampaign"("ivrFlowVersionId");
CREATE INDEX "Call_ivrFlowVersionId_idx" ON "Call"("ivrFlowVersionId");

ALTER TABLE "IVRFlow" ADD CONSTRAINT "IVRFlow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IVRFlowVersion" ADD CONSTRAINT "IVRFlowVersion_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "IVRFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IVRFlowVersion" ADD CONSTRAINT "IVRFlowVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IVRFlowVersion" ADD CONSTRAINT "IVRFlowVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboundProfile" ADD CONSTRAINT "InboundProfile_ivrFlowVersionId_fkey" FOREIGN KEY ("ivrFlowVersionId") REFERENCES "IVRFlowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_ivrFlowVersionId_fkey" FOREIGN KEY ("ivrFlowVersionId") REFERENCES "IVRFlowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_ivrFlowVersionId_fkey" FOREIGN KEY ("ivrFlowVersionId") REFERENCES "IVRFlowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
