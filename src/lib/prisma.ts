import {
  PrismaClient,
} from "@prisma/client";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "prisma"
  );

//--------------------------------------------------
// Global Prisma State
//--------------------------------------------------

type PrismaGlobal =
  typeof globalThis & {
    __ivrPrismaClient?:
      PrismaClient;
  };

const prismaGlobal =
  globalThis as PrismaGlobal;

//--------------------------------------------------
// Prisma Client
//--------------------------------------------------

function createPrismaClient():
  PrismaClient {
  const client =
    new PrismaClient();

  log.info(
    {
      event:
        "prisma.client.created",
    },
    "Prisma client created"
  );

  return client;
}

export const prisma =
  prismaGlobal
    .__ivrPrismaClient ??
  createPrismaClient();

/*
 * Preserve one Prisma client across Next.js
 * development hot reloads.
 */
if (
  process.env.NODE_ENV !==
  "production"
) {
  prismaGlobal
    .__ivrPrismaClient =
    prisma;
}

//--------------------------------------------------
// Close Prisma Connection
//--------------------------------------------------

export async function closePrismaConnection():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "prisma.disconnect.started",
    },
    "Prisma disconnect started"
  );

  try {
    await prisma.$disconnect();

    if (
      prismaGlobal
        .__ivrPrismaClient ===
      prisma
    ) {
      delete prismaGlobal
        .__ivrPrismaClient;
    }

    log.info(
      {
        event:
          "prisma.disconnect.completed",

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Prisma disconnected"
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "prisma.disconnect.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Prisma disconnect failed"
    );

    throw error;
  }
}