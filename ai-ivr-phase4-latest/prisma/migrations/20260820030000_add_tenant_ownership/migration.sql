ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
ALTER TABLE "IVRFlow" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Campaign_ownerUserId_idx" ON "Campaign"("ownerUserId");
CREATE INDEX IF NOT EXISTS "IVRFlow_ownerUserId_idx" ON "IVRFlow"("ownerUserId");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_ownerUserId_idx" ON "KnowledgeDocument"("ownerUserId");

DO $$ BEGIN
  ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "IVRFlow" ADD CONSTRAINT "IVRFlow_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
