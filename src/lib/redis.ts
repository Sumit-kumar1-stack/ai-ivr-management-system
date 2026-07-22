import IORedis from "ioredis";


//--------------------------------------------------
// Redis URL
//--------------------------------------------------

const redisUrl =
  process.env.REDIS_URL
    ?.trim() ??
  "redis://127.0.0.1:6379";


//--------------------------------------------------
// Shared Redis Connection
//--------------------------------------------------

export const redisConnection =
  new IORedis(
    redisUrl,
    {
      maxRetriesPerRequest:
        null,

      enableReadyCheck:
        false,
    }
  );


//--------------------------------------------------
// Redis Events
//--------------------------------------------------

redisConnection.on(
  "connect",
  () => {

    console.log(
      "Redis connection established"
    );

  }
);


redisConnection.on(
  "ready",
  () => {

    console.log(
      "Redis connection ready"
    );

  }
);


redisConnection.on(
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


redisConnection.on(
  "close",
  () => {

    console.warn(
      "Redis connection closed"
    );

  }
);


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

}