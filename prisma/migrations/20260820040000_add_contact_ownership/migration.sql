ALTER TABLE "Contact"
ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Contact_ownerUserId_idx"
ON "Contact" ("ownerUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Contact_ownerUserId_fkey'
  ) THEN
    ALTER TABLE "Contact"
    ADD CONSTRAINT "Contact_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
