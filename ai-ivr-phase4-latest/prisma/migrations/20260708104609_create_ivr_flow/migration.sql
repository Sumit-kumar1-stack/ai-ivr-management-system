-- CreateTable
CREATE TABLE "public"."IVRFlow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "campaignId" TEXT,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IVRFlow_pkey" PRIMARY KEY ("id")
);
