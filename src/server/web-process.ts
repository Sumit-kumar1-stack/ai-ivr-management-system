import "next/dist/server/node-environment";

import {
  loadEnvConfig,
} from "@next/env";

import {
  createServerLogger,
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
  "web";

validateEnvironmentFor("web");

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "web-process"
  );

//--------------------------------------------------
// Start Web Process
//--------------------------------------------------

async function startWebProcess():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "web.process.start.started",
    },
    "Web process startup started"
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
        "web.process.subscribers.initialized",
    },
    "Application subscribers initialized"
  );

  //----------------------------------------
  // Start Next.js And Socket.IO
  //----------------------------------------

  const {
    startServer,
    closeHttpServer,
  } = await import(
    "@/server/server"
  );

  const {
    closeSocketServer,
  } = await import(
    "@/server/socket"
  );

  await startServer();

  //----------------------------------------
  // Start Cross-Process Realtime Bridge
  //----------------------------------------

  const {
    startRealtimeSubscriber,
    closeRealtimeSubscriber,
  } = await import(
    "@/services/realtime/redis-realtime-bridge.service"
  );

  await startRealtimeSubscriber();

  log.info(
    {
      event:
        "web.process.realtime_subscriber.initialized",
    },
    "Cross-process realtime subscriber initialized"
  );

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
      "web",

    loggerComponent:
      "web-process-lifecycle",

    resources: [
      {
        name:
          "realtime-redis-subscriber",

        close:
          closeRealtimeSubscriber,
      },

      {
        name:
          "socket-server",

        close:
          closeSocketServer,
      },

      {
        name:
          "http-server",

        close:
          closeHttpServer,
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
        "web.process.start.completed",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Web process started"
  );
}

//--------------------------------------------------
// Start Entry Point
//--------------------------------------------------

startWebProcess().catch(
  (
    error: unknown
  ) => {
    log.fatal(
      {
        event:
          "web.process.start.failed",

        error:
          normalizeError(
            error
          ),
      },
      "Web process startup failed"
    );

    process.exit(
      1
    );
  }
);
