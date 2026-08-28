import {
  loadEnvConfig,
} from "@next/env";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

/*
 * Load Next.js environment files before importing
 * Redis, Prisma, BullMQ workers or application
 * services.
 */
loadEnvConfig(
  process.cwd()
);

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "application-bootstrap"
  );

//--------------------------------------------------
// Configuration
//--------------------------------------------------

const DEFAULT_SHUTDOWN_TIMEOUT_MS =
  30_000;

//--------------------------------------------------
// Application Resource Closers
//--------------------------------------------------

interface ApplicationResources {
  closeHttpServer:
    () => Promise<void>;

  closeSocketServer:
    () => Promise<void>;

  closeWorkers:
    () => Promise<void>;

  closeRedisConnection:
    () => Promise<void>;

  closePrismaConnection:
    () => Promise<void>;
}

//--------------------------------------------------
// Bootstrap Application
//--------------------------------------------------

async function bootstrap():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "application.bootstrap.started",
    },
    "Application bootstrap started"
  );

  //----------------------------------------
  // Initialize Application Subscribers
  //----------------------------------------

  const {
    bootstrap:
      initializeApplication,
  } = await import(
    "@/core/bootstrap"
  );

  initializeApplication();

  log.info(
    {
      event:
        "application.subscribers.initialized",
    },
    "Application subscribers initialized"
  );

  //----------------------------------------
  // Initialize Background Workers
  //----------------------------------------

  const {
    initializeWorkers,
    closeWorkers,
  } = await import(
    "@/workers/initialize-workers"
  );

  initializeWorkers();

  log.info(
    {
      event:
        "application.workers.initialized",
    },
    "Background workers initialized"
  );

  //----------------------------------------
  // Start Main HTTP Server
  //----------------------------------------

  const {
    startServer,
    closeHttpServer,
  } = await import(
    "./server"
  );

  await startServer();

  const {
    closeSocketServer,
  } = await import(
    "./socket"
  );

  const {
    closeRedisConnection,
  } = await import(
    "@/lib/redis"
  );

  const {
    closePrismaConnection,
  } = await import(
    "@/lib/prisma"
  );

  const resources:
    ApplicationResources = {
      closeHttpServer,

      closeSocketServer,

      closeWorkers,

      closeRedisConnection,

      closePrismaConnection,
    };

  log.info(
    {
      event:
        "application.bootstrap.completed",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Server, subscribers, workers and resources initialized"
  );

  registerShutdownHandlers(
    resources
  );
}

//--------------------------------------------------
// Register Shutdown Handlers
//--------------------------------------------------

function registerShutdownHandlers(
  resources:
    ApplicationResources
): void {
  let shutdownPromise:
    Promise<void> |
    null =
      null;

  const shutdown =
    (
      reason: string,
      requestedExitCode:
        number
    ): Promise<void> => {
      if (
        shutdownPromise
      ) {
        log.warn(
          {
            event:
              "application.shutdown.duplicate",

            reason,
          },
          "Shutdown is already in progress"
        );

        return shutdownPromise;
      }

      shutdownPromise =
        performShutdown(
          resources,
          reason,
          requestedExitCode
        );

      return shutdownPromise;
    };

  //----------------------------------------
  // Operating-System Signals
  //----------------------------------------

  process.once(
    "SIGINT",
    () => {
      void shutdown(
        "SIGINT",
        0
      );
    }
  );

  process.once(
    "SIGTERM",
    () => {
      void shutdown(
        "SIGTERM",
        0
      );
    }
  );

  //----------------------------------------
  // Fatal Process Errors
  //----------------------------------------

  process.once(
    "uncaughtException",
    (
      error: Error
    ) => {
      log.fatal(
        {
          event:
            "application.uncaught_exception",

          error:
            normalizeError(
              error
            ),
        },
        "Uncaught exception"
      );

      void shutdown(
        "uncaughtException",
        1
      );
    }
  );

  process.once(
    "unhandledRejection",
    (
      reason: unknown
    ) => {
      log.fatal(
        {
          event:
            "application.unhandled_rejection",

          error:
            normalizeError(
              reason
            ),
        },
        "Unhandled promise rejection"
      );

      void shutdown(
        "unhandledRejection",
        1
      );
    }
  );
}

//--------------------------------------------------
// Perform Ordered Shutdown
//--------------------------------------------------

async function performShutdown(
  resources:
    ApplicationResources,
  reason: string,
  requestedExitCode:
    number
): Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  const timeoutMs =
    getShutdownTimeoutMs();

  let exitCode =
    requestedExitCode;

  log.info(
    {
      event:
        "application.shutdown.started",

      reason,

      requestedExitCode,

      timeoutMs,
    },
    "Application shutdown started"
  );

  const timeout =
    setTimeout(
      () => {
        log.fatal(
          {
            event:
              "application.shutdown.timeout",

            reason,

            timeoutMs,

            durationMs:
              getDurationMs(
                startedAt
              ),
          },
          "Application shutdown exceeded its timeout"
        );

        process.exit(
          1
        );
      },
      timeoutMs
    );

  timeout.unref?.();

  const failures:
    Array<{
      resource: string;

      error: ReturnType<
        typeof normalizeError
      >;
    }> = [];

  try {
    /*
     * Socket.IO is closed before the HTTP server.
     * This disconnects polling clients so HTTP
     * server.close() does not wait on them.
     */

    await closeResource(
      "socket-server",
      resources
        .closeSocketServer,
      failures
    );

    /*
     * Stop accepting new HTTP traffic and wait for
     * currently active requests to finish.
     */

    await closeResource(
      "http-server",
      resources
        .closeHttpServer,
      failures
    );

    /*
     * Stop timers, BullMQ workers and BullMQ queues
     * before closing their shared Redis connection.
     */

    await closeResource(
      "workers-and-queues",
      resources
        .closeWorkers,
      failures
    );

    await closeResource(
      "redis",
      resources
        .closeRedisConnection,
      failures
    );

    /*
     * Prisma is disconnected last because worker
     * shutdown may still need database access.
     */

    await closeResource(
      "prisma",
      resources
        .closePrismaConnection,
      failures
    );

    if (
      failures.length >
      0
    ) {
      exitCode =
        1;

      log.error(
        {
          event:
            "application.shutdown.partial_failure",

          reason,

          failures,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Application shutdown completed with resource failures"
      );
    } else {
      log.info(
        {
          event:
            "application.shutdown.completed",

          reason,

          exitCode,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Application resources closed successfully"
      );
    }
  } catch (
    error
  ) {
    exitCode =
      1;

    log.error(
      {
        event:
          "application.shutdown.failed",

        reason,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Unexpected application shutdown failure"
    );
  } finally {
    clearTimeout(
      timeout
    );

    /*
     * Give the logger a brief opportunity to flush
     * final records before terminating the process.
     */
    await wait(
      50
    );

    process.exit(
      exitCode
    );
  }
}

//--------------------------------------------------
// Close One Resource Safely
//--------------------------------------------------

async function closeResource(
  resourceName: string,
  close:
    () => Promise<void>,
  failures:
    Array<{
      resource: string;

      error: ReturnType<
        typeof normalizeError
      >;
    }>
): Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "application.resource.close.started",

      resource:
        resourceName,
    },
    "Application resource shutdown started"
  );

  try {
    await close();

    log.info(
      {
        event:
          "application.resource.close.completed",

        resource:
          resourceName,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Application resource closed"
    );
  } catch (
    error
  ) {
    const normalizedError =
      normalizeError(
        error
      );

    failures.push({
      resource:
        resourceName,

      error:
        normalizedError,
    });

    log.error(
      {
        event:
          "application.resource.close.failed",

        resource:
          resourceName,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizedError,
      },
      "Application resource failed to close"
    );
  }
}

//--------------------------------------------------
// Shutdown Timeout
//--------------------------------------------------

function getShutdownTimeoutMs():
  number {
  const rawValue =
    process.env
      .SHUTDOWN_TIMEOUT_MS
      ?.trim();

  const parsedValue =
    rawValue
      ? Number(
          rawValue
        )
      : DEFAULT_SHUTDOWN_TIMEOUT_MS;

  if (
    !Number.isInteger(
      parsedValue
    ) ||
    parsedValue <
      5_000 ||
    parsedValue >
      120_000
  ) {
    log.warn(
      {
        event:
          "application.shutdown.invalid_timeout",

        configuredValue:
          rawValue,

        fallbackValue:
          DEFAULT_SHUTDOWN_TIMEOUT_MS,
      },
      "Invalid SHUTDOWN_TIMEOUT_MS; using default"
    );

    return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  }

  return parsedValue;
}

//--------------------------------------------------
// Small Delay
//--------------------------------------------------

function wait(
  milliseconds: number
): Promise<void> {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

//--------------------------------------------------
// Start Bootstrap
//--------------------------------------------------

bootstrap().catch(
  (
    error: unknown
  ) => {
    log.fatal(
      {
        event:
          "application.bootstrap.failed",

        error:
          normalizeError(
            error
          ),
      },
      "Application bootstrap failed"
    );

    process.exit(
      1
    );
  }
);