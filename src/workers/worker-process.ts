import {
  loadEnvConfig,
} from "@next/env";

import {
  createWorkerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import {
  registerProcessLifecycle,
} from "@/server/process-lifecycle";
import { validateEnvironmentFor } from "@/config/process-environment";

//--------------------------------------------------
// Load Environment First
//--------------------------------------------------

loadEnvConfig(
  process.cwd()
);

process.env.IVR_PROCESS_NAME =
  "worker";

validateEnvironmentFor("worker");

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createWorkerLogger(
    "worker-process"
  );

//--------------------------------------------------
// Start Worker Process
//--------------------------------------------------

async function startWorkerProcess():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "worker.process.start.started",
    },
    "Worker process startup started"
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

  //----------------------------------------
  // Initialize Workers
  //----------------------------------------

  const {
    initializeWorkers,
    closeWorkers,
    areWorkersInitialized,
  } = await import(
    "@/workers/initialize-workers"
  );

  initializeWorkers();

  if (
    !areWorkersInitialized()
  ) {
    throw new Error(
      "Workers failed to enter initialized state"
    );
  }

    //----------------------------------------
  // Start Worker Health Server
  //----------------------------------------

  const {
    startWorkerHealthServer,
    closeWorkerHealthServer,
  } = await import(
    "@/workers/worker-health-server"
  );

  await startWorkerHealthServer();

  //----------------------------------------
  // Load Process-Owned Connections
  //----------------------------------------

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

  //----------------------------------------
  // Register Graceful Shutdown
  //----------------------------------------

  registerProcessLifecycle({
    processName:
      "worker",

    loggerComponent:
      "worker-process-lifecycle",

    resources: [

      {
    name:
      "worker-health-server",

    close:
      closeWorkerHealthServer,
  },
      {
        name:
          "workers-and-queues",

        close:
          closeWorkers,
      },

      {
        name:
          "redis",

        close:
          closeRedisConnection,
      },

      {
        name:
          "prisma",

        close:
          closePrismaConnection,
      },
    ],
  });

  log.info(
    {
      event:
        "worker.process.start.completed",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Worker process started"
  );
}

//--------------------------------------------------
// Start Entry Point
//--------------------------------------------------

startWorkerProcess().catch(
  (
    error: unknown
  ) => {
    log.fatal(
      {
        event:
          "worker.process.start.failed",

        error:
          normalizeError(
            error
          ),
      },
      "Worker process startup failed"
    );

    process.exit(
      1
    );
  }
);
