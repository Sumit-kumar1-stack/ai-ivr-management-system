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
// Create Prisma Client
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

//--------------------------------------------------
// Get Prisma Client
//--------------------------------------------------

function getPrismaClient():
  PrismaClient {
  const existing =
    prismaGlobal
      .__ivrPrismaClient;

  if (
    existing
  ) {
    return existing;
  }

  const client =
    createPrismaClient();

  prismaGlobal
    .__ivrPrismaClient =
    client;

  return client;
}

//--------------------------------------------------
// Lazy Prisma Proxy
//--------------------------------------------------

/*
 * Preserve the existing prisma.model.method() API.
 *
 * The real PrismaClient is created only when code
 * first accesses a Prisma property at runtime.
 * Importing this module during next build therefore
 * does not create a Prisma client.
 */
export const prisma =
  new Proxy(
    {} as PrismaClient,
    {
      get(
        _target,
        property
      ) {
        const client =
          getPrismaClient();

        /*
         * Use the actual Prisma client as the receiver.
         * Some Prisma properties rely on their internal
         * `this` value being the real client instance.
         */
        const value =
          Reflect.get(
            client,
            property,
            client
          );

        if (
          typeof value ===
            "function"
        ) {
          return value.bind(
            client
          );
        }

        return value;
      },
    }
  );

//--------------------------------------------------
// Close Prisma Connection
//--------------------------------------------------

export async function closePrismaConnection():
  Promise<void> {
  const client =
    prismaGlobal
      .__ivrPrismaClient;

  /*
   * Do not create a Prisma client merely to close it.
   */
  if (
    !client
  ) {
    return;
  }

  const startedAt =
    process.hrtime.bigint();

  delete prismaGlobal
    .__ivrPrismaClient;

  log.info(
    {
      event:
        "prisma.disconnect.started",
    },
    "Prisma disconnect started"
  );

  try {
    await client.$disconnect();

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