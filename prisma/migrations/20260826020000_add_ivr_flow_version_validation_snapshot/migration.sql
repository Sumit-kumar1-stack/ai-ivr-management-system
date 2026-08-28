ALTER TABLE "IVRFlowVersion"
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "publishedByUserId" TEXT,
  ADD COLUMN "validationStatus" "IVRFlowValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN "validatedAt" TIMESTAMP(3);

UPDATE "IVRFlowVersion"
SET "validationStatus" = 'VALID'::"IVRFlowValidationStatus",
    "validatedAt" = COALESCE("publishedAt", "createdAt"),
    "approvedByUserId" = (
      SELECT "approvedByUserId" FROM "IVRFlow" WHERE "IVRFlow"."id" = "IVRFlowVersion"."flowId"
    ),
    "publishedByUserId" = (
      SELECT "ownerUserId" FROM "IVRFlow" WHERE "IVRFlow"."id" = "IVRFlowVersion"."flowId"
    )
WHERE "status" = 'PUBLISHED';

ALTER TABLE "IVRFlowVersion"
  ADD CONSTRAINT "IVRFlowVersion_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "IVRFlowVersion_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
