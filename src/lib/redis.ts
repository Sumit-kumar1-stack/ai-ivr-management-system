import IORedis from "ioredis";

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
// Redis URL
//--------------------------------------------------

const redisUrl =
  process.env.REDIS_URL
    ?.trim() ??
  "redis://127.0.0.1:6379";

//--------------------------------------------------
// Create Redis Connection
//--------------------------------------------------

function createRedisConnection():
  IORedis {
  const connection =
    new IORedis(
      redisUrl,
      {
        maxRetriesPerRequest:
          null,

        enableReadyCheck:
          false,

        lazyConnect:
          false,

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
      console.log(
        "Redis connection established"
      );
    }
  );

  connection.on(
    "ready",
    () => {
      console.log(
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
    console.warn(
      "Redis reconnecting",
      {
        delay,
      }
    );
  }
);

  connection.on(
    "error",
    error => {
      console.error(
        "Redis connection error",
        {
          name:
            error.name,

          message:
            error.message,
        }
      );
    }
  );

  connection.on(
    "close",
    () => {
      console.warn(
        "Redis connection closed"
      );
    }
  );

  connection.on(
    "end",
    () => {
      console.warn(
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
 * Preserve the connection across Next.js development
 * module reloads.
 */
redisGlobal
  .__ivrRedisConnection =
  redisConnection;

//--------------------------------------------------
// Close Redis
//--------------------------------------------------

export async function closeRedisConnection():
  Promise<void> {
  if (
    redisConnection.status ===
      "end"
  ) {
    return;
  }

  await redisConnection.quit();

  delete redisGlobal
    .__ivrRedisConnection;
}