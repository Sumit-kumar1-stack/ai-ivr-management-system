CREATE TYPE "IVRFlowLifecycle" AS ENUM ('DRAFT', 'VALIDATED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "IVRFlowValidationStatus" AS ENUM ('NOT_VALIDATED', 'VALID', 'INVALID');

ALTER TABLE "IVRFlow"
  ADD COLUMN "lifecycle" "IVRFlowLifecycle" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "validationStatus" "IVRFlowValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN "validatedAt" TIMESTAMP(3),
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "submittedByUserId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedByUserId" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "updatedByUserId" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "IVRFlow"
SET "lifecycle" = CASE WHEN "isPublished" THEN 'PUBLISHED'::"IVRFlowLifecycle" ELSE 'DRAFT'::"IVRFlowLifecycle" END;

CREATE INDEX "IVRFlow_tenantId_lifecycle_idx" ON "IVRFlow"("tenantId", "lifecycle");
