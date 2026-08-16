import {
  NextResponse,
} from "next/server";

import {
  checkIntegrationConfiguration,
  isIntegrationConfigurationReady,
} from "@/config/readiness";

import {
  prisma,
} from "@/lib/prisma";

import {
  redisConnection,
} from "@/lib/redis";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "web-readiness-check"
  );

//--------------------------------------------------
// Dependency Result
//--------------------------------------------------

interface DependencyResult {
  healthy: boolean;
  durationMs: number;
  message: string;
}

//--------------------------------------------------
// Readiness Endpoint
//--------------------------------------------------

export async function GET():
  Promise<NextResponse> {
  const startedAt =
    process.hrtime.bigint();

  const configuration =
    checkIntegrationConfiguration();

  /*
   * The web process owns only its database and Redis
   * dependencies. Background workers run in their
   * own operating-system process.
   */
  const [
    database,
    redis,
  ] =
    await Promise.all([
      checkDatabase(),
      checkRedis(),
    ]);

  const ready =
    database.healthy &&
    redis.healthy &&
    isIntegrationConfigurationReady(
      configuration
    );

  const durationMs =
    getDurationMs(
      startedAt
    );

  const logData = {
    event:
      ready
        ? "web.readiness.check.passed"
        : "web.readiness.check.failed",

    process:
      "web",

    durationMs,

    database,

    redis,

    configuration,
  };

  if (
    ready
  ) {
    log.debug(
      logData,
      "Web process readiness check passed"
    );
  } else {
    log.warn(
      logData,
      "Web process readiness check failed"
    );
  }

  return NextResponse.json(
    {
      success:
        ready,

      status:
        ready
          ? "ready"
          : "not_ready",

      service:
        "ai-ivr-management-system",

      process:
        "web",

      environment:
        process.env.NODE_ENV ??
        "development",

      timestamp:
        new Date()
          .toISOString(),

      uptimeSeconds:
        Math.floor(
          process.uptime()
        ),

      durationMs,

      dependencies: {
        database,
        redis,
        configuration,
      },
    },
    {
      status:
        ready
          ? 200
          : 503,

      headers: {
        "Cache-Control":
          "no-store, max-age=0",

        Pragma:
          "no-cache",
      },
    }
  );
}

//--------------------------------------------------
// Database Check
//--------------------------------------------------

async function checkDatabase():
  Promise<DependencyResult> {
  const startedAt =
    process.hrtime.bigint();

  try {
    await prisma.$queryRaw`
      SELECT 1
    `;

    return {
      healthy:
        true,

      durationMs:
        getDurationMs(
          startedAt
        ),

      message:
        "PostgreSQL connection available",
    };
  } catch (
    error
  ) {
    return {
      healthy:
        false,

      durationMs:
        getDurationMs(
          startedAt
        ),

      message:
        normalizeError(
          error
        ).message,
    };
  }
}

//--------------------------------------------------
// Redis Check
//--------------------------------------------------

async function checkRedis():
  Promise<DependencyResult> {
  const startedAt =
    process.hrtime.bigint();

  try {
    const result =
      await redisConnection.ping();

    if (
      result !==
      "PONG"
    ) {
      throw new Error(
        `Unexpected Redis response: ${result}`
      );
    }

    return {
      healthy:
        true,

      durationMs:
        getDurationMs(
          startedAt
        ),

      message:
        "Redis connection available",
    };
  } catch (
    error
  ) {
    return {
      healthy:
        false,

      durationMs:
        getDurationMs(
          startedAt
        ),

      message:
        normalizeError(
          error
        ).message,
    };
  }
}