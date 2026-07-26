import http, {
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  prisma,
} from "@/lib/prisma";

import {
  redisConnection,
} from "@/lib/redis";

import {
  areWorkersInitialized,
} from "@/workers/initialize-workers";

import {
  createWorkerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createWorkerLogger(
    "worker-health-server"
  );

//--------------------------------------------------
// Configuration
//--------------------------------------------------

const WORKER_HEALTH_PORT =
  parsePort(
    process.env
      .WORKER_HEALTH_PORT
  );

//--------------------------------------------------
// Types
//--------------------------------------------------

interface DependencyResult {
  healthy: boolean;

  durationMs: number;

  message: string;
}

//--------------------------------------------------
// Server State
//--------------------------------------------------

let healthServer:
  http.Server |
  null =
    null;

let serverStarting:
  Promise<void> |
  null =
    null;

let serverClosing:
  Promise<void> |
  null =
    null;

//--------------------------------------------------
// Start Worker Health Server
//--------------------------------------------------

export function startWorkerHealthServer():
  Promise<void> {
  if (
    healthServer
      ?.listening
  ) {
    log.debug(
      {
        event:
          "worker.health_server.start.skipped",

        reason:
          "already_listening",

        port:
          WORKER_HEALTH_PORT,
      },
      "Worker health server is already listening"
    );

    return Promise.resolve();
  }

  if (
    serverStarting
  ) {
    return serverStarting;
  }

  serverStarting =
    startWorkerHealthServerInternal()
      .finally(
        () => {
          serverStarting =
            null;
        }
      );

  return serverStarting;
}

//--------------------------------------------------
// Internal Startup
//--------------------------------------------------

async function startWorkerHealthServerInternal():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  const server =
    http.createServer(
      handleRequest
    );

  healthServer =
    server;

  server.on(
    "error",
    (
      error:
        NodeJS.ErrnoException
    ) => {
      if (
        error.code ===
        "EADDRINUSE"
      ) {
        log.fatal(
          {
            event:
              "worker.health_server.port_in_use",

            port:
              WORKER_HEALTH_PORT,

            error:
              normalizeError(
                error
              ),
          },
          "Worker health server port is already in use"
        );

        return;
      }

      log.error(
        {
          event:
            "worker.health_server.error",

          port:
            WORKER_HEALTH_PORT,

          error:
            normalizeError(
              error
            ),
        },
        "Worker health server error"
      );
    }
  );

  server.on(
    "clientError",
    (
      error,
      socket
    ) => {
      log.warn(
        {
          event:
            "worker.health_server.client_error",

          error:
            normalizeError(
              error
            ),
        },
        "Worker health server client error"
      );

      if (
        socket.writable
      ) {
        socket.end(
          "HTTP/1.1 400 Bad Request\r\n\r\n"
        );
      }
    }
  );

  try {
    await new Promise<void>(
      (
        resolve,
        reject
      ) => {
        const onError =
          (
            error: Error
          ) => {
            server.off(
              "listening",
              onListening
            );

            reject(
              error
            );
          };

        const onListening =
          () => {
            server.off(
              "error",
              onError
            );

            resolve();
          };

        server.once(
          "error",
          onError
        );

        server.once(
          "listening",
          onListening
        );

        server.listen(
          WORKER_HEALTH_PORT
        );
      }
    );
  } catch (
    error
  ) {
    if (
      healthServer ===
      server
    ) {
      healthServer =
        null;
    }

    throw error;
  }

  log.info(
    {
      event:
        "worker.health_server.listening",

      port:
        WORKER_HEALTH_PORT,

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Worker health server is listening"
  );
}

//--------------------------------------------------
// Request Handler
//--------------------------------------------------

async function handleRequest(
  request:
    IncomingMessage,

  response:
    ServerResponse
): Promise<void> {
  const url =
    new URL(
      request.url ??
        "/",

      `http://${request.headers.host ?? "localhost"}`
    );

  //----------------------------------------
  // Liveness
  //----------------------------------------

  if (
    request.method ===
      "GET" &&
    url.pathname ===
      "/health"
  ) {
    sendJson(
      response,
      200,
      {
        success:
          true,

        status:
          "healthy",

        service:
          "ai-ivr-management-system",

        process:
          "worker",

        timestamp:
          new Date()
            .toISOString(),

        uptimeSeconds:
          Math.floor(
            process.uptime()
          ),
      }
    );

    return;
  }

  //----------------------------------------
  // Readiness
  //----------------------------------------

  if (
    request.method ===
      "GET" &&
    url.pathname ===
      "/ready"
  ) {
    await handleReadiness(
      response
    );

    return;
  }

  //----------------------------------------
  // Not Found
  //----------------------------------------

  sendJson(
    response,
    404,
    {
      success:
        false,

      message:
        "Not found",
    }
  );
}

//--------------------------------------------------
// Readiness Handler
//--------------------------------------------------

async function handleReadiness(
  response:
    ServerResponse
): Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  const [
    database,
    redis,
  ] =
    await Promise.all([
      checkDatabase(),
      checkRedis(),
    ]);

  const workersHealthy =
    areWorkersInitialized();

  const workers:
    DependencyResult = {
      healthy:
        workersHealthy,

      durationMs:
        0,

      message:
        workersHealthy
          ? "Background workers initialized"
          : "Background workers are not initialized",
    };

  const ready =
    database.healthy &&
    redis.healthy &&
    workers.healthy;

  const durationMs =
    getDurationMs(
      startedAt
    );

  if (
    ready
  ) {
    log.debug(
      {
        event:
          "worker.readiness.check.passed",

        durationMs,

        database,

        redis,

        workers,
      },
      "Worker readiness check passed"
    );
  } else {
    log.warn(
      {
        event:
          "worker.readiness.check.failed",

        durationMs,

        database,

        redis,

        workers,
      },
      "Worker readiness check failed"
    );
  }

  sendJson(
    response,
    ready
      ? 200
      : 503,
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
        "worker",

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

        workers,
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

//--------------------------------------------------
// Send JSON
//--------------------------------------------------

function sendJson(
  response:
    ServerResponse,

  statusCode:
    number,

  body:
    unknown
): void {
  const serialized =
    JSON.stringify(
      body
    );

  response.writeHead(
    statusCode,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Content-Length":
        Buffer.byteLength(
          serialized,
          "utf8"
        ),

      "Cache-Control":
        "no-store, max-age=0",

      Pragma:
        "no-cache",
    }
  );

  response.end(
    serialized
  );
}

//--------------------------------------------------
// Close Worker Health Server
//--------------------------------------------------

export function closeWorkerHealthServer():
  Promise<void> {
  if (
    serverClosing
  ) {
    return serverClosing;
  }

  serverClosing =
    closeWorkerHealthServerInternal()
      .finally(
        () => {
          serverClosing =
            null;
        }
      );

  return serverClosing;
}

//--------------------------------------------------
// Internal Shutdown
//--------------------------------------------------

async function closeWorkerHealthServerInternal():
  Promise<void> {
  const server =
    healthServer;

  if (
    !server
  ) {
    log.debug(
      {
        event:
          "worker.health_server.close.skipped",

        reason:
          "not_initialized",
      },
      "Worker health server is not initialized"
    );

    return;
  }

  const startedAt =
    process.hrtime.bigint();

  healthServer =
    null;

  if (
    !server.listening
  ) {
    return;
  }

  await new Promise<void>(
    (
      resolve,
      reject
    ) => {
      server.close(
        error => {
          if (
            error
          ) {
            reject(
              error
            );

            return;
          }

          resolve();
        }
      );

      server.closeIdleConnections?.();
    }
  );

  log.info(
    {
      event:
        "worker.health_server.close.completed",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Worker health server closed"
  );
}

//--------------------------------------------------
// Server State
//--------------------------------------------------

export function isWorkerHealthServerListening():
  boolean {
  return Boolean(
    healthServer
      ?.listening
  );
}

//--------------------------------------------------
// Parse Port
//--------------------------------------------------

function parsePort(
  rawValue:
    string |
    undefined
): number {
  const normalized =
    rawValue?.trim();

  const parsed =
    normalized
      ? Number(
          normalized
        )
      : 3002;

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <
      1 ||
    parsed >
      65_535
  ) {
    throw new Error(
      `Invalid WORKER_HEALTH_PORT value: ${rawValue}`
    );
  }

  return parsed;
}