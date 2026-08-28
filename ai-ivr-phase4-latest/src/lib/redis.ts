import IORedis from "ioredis";

import {
  getRedisEnvironment,
} from "@/config/env";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "redis"
  );

//--------------------------------------------------
// Redis Global State
//--------------------------------------------------

type RedisGlobal =
  typeof globalThis & {
    __ivrRedisConnection?:
      IORedis;
  };

const redisGlobal =
  globalThis as RedisGlobal;

//--------------------------------------------------
// Create Redis Connection
//--------------------------------------------------

function createRedisConnection():
  IORedis {
  const {
    redisUrl,
  } =
    getRedisEnvironment();

  const connection =
    new IORedis(
      redisUrl,
      {
        maxRetriesPerRequest:
          null,

        enableReadyCheck:
          false,

        /*
         * Do not open a network connection merely
         * because a module imported this file.
         *
         * The first Redis command, publish, subscribe
         * or explicit connect call starts the
         * connection automatically.
         */
        lazyConnect:
          true,

        /*
         * Prevent unbounded retry intervals while
         * still allowing Redis to recover.
         */
        retryStrategy(
          retryCount
        ) {
          return Math.min(
            retryCount *
              500,
            5_000
          );
        },
      }
    );

  //----------------------------------------
  // Redis Events
  //----------------------------------------

  connection.on(
    "connect",
    () => {
      log.info(
        {
          event:
            "redis.connection.established",
        },
        "Redis connection established"
      );
    }
  );

  connection.on(
    "ready",
    () => {
      log.info(
        {
          event:
            "redis.connection.ready",
        },
        "Redis connection ready"
      );
    }
  );

  connection.on(
    "reconnecting",
    (
      delay:
        number
    ) => {
      log.warn(
        {
          event:
            "redis.connection.reconnecting",

          delay,
        },
        "Redis connection reconnecting"
      );
    }
  );

  connection.on(
    "error",
    error => {
      log.error(
        {
          event:
            "redis.connection.error",

          error:
            normalizeError(
              error
            ),
        },
        "Redis connection error"
      );
    }
  );

  connection.on(
    "close",
    () => {
      log.warn(
        {
          event:
            "redis.connection.closed",
        },
        "Redis connection closed"
      );
    }
  );

  connection.on(
    "end",
    () => {
      log.warn(
        {
          event:
            "redis.connection.ended",
        },
        "Redis connection ended"
      );
    }
  );

  return connection;
}

//--------------------------------------------------
// Shared Process-Global Redis Connection
//--------------------------------------------------

export const redisConnection =
  redisGlobal
    .__ivrRedisConnection ??
  createRedisConnection();

/*
 * Preserve one connection across development module
 * reloads and duplicate imports in the same process.
 */
redisGlobal
  .__ivrRedisConnection =
  redisConnection;

//--------------------------------------------------
// Close Redis Connection
//--------------------------------------------------

export async function closeRedisConnection():
  Promise<void> {
  const connection =
    redisGlobal
      .__ivrRedisConnection;

  if (
    !connection
  ) {
    return;
  }

  delete redisGlobal
    .__ivrRedisConnection;

  /*
   * A lazy client may never have opened a socket.
   * Calling quit() while its status is "wait" would
   * unnecessarily initiate a connection.
   */
  if (
    connection.status ===
      "wait"
  ) {
    connection.disconnect();

    return;
  }

  if (
    connection.status ===
      "end"
  ) {
    return;
  }

  try {
    await connection.quit();
  } catch (
    error
  ) {
    log.warn(
      {
        event:
          "redis.disconnect.graceful_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Graceful Redis shutdown failed; disconnecting"
    );

    connection.disconnect();
  }
}