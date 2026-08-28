import http, {
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  WebSocket,
  type WebSocketServer,
} from "ws";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";
import { ProviderFactory } from "@/providers/telephony/provider.factory";

import {
  registerProcessLifecycle,
} from "@/server/process-lifecycle";
import { beginMediaDrain, getMediaDrainTimeoutMs, getMediaLifecycleState, markMediaRunning, markMediaTerminated } from "@/server/media-lifecycle";
import { checkIntegrationConfiguration, isIntegrationConfigurationReady } from "@/config/readiness";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "media-process"
  );

//--------------------------------------------------
// Configuration
//--------------------------------------------------

const MEDIA_PORT =
  parsePort(
    process.env
      .TWILIO_MEDIA_PORT
  );

//--------------------------------------------------
// Process State
//--------------------------------------------------

let mediaHttpServer:
  http.Server |
  null =
    null;

let mediaWebSocketServer:
  WebSocketServer |
  null =
    null;

let exotelMediaWebSocketServer:
  WebSocketServer |
  null =
    null;

let plivoMediaWebSocketServer:
  WebSocketServer |
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
// Start Media Process
//--------------------------------------------------

export async function startMediaProcess():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();
  const selectedProvider = ProviderFactory.getProviderName();

  log.info(
    {
      event:
        "media.process.start.started",

      port:
        MEDIA_PORT,
      selectedProvider,
    },
    "Media process startup started"
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
  // Start HTTP And WebSocket Server
  //----------------------------------------

  await startMediaServer();
  markMediaRunning();

  //----------------------------------------
  // Load Process-Owned Resources
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
      "media",

    loggerComponent:
      "media-process-lifecycle",

    resources: [
      { name: "media-call-drain", close: drainMediaCalls },
      {
        name:
          "media-websocket-clients",

        close:
          closeMediaWebSocketClients,
      },

      {
        name:
          "media-http-server",

        close:
          closeMediaServer,
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
        "media.process.start.completed",

      port:
        MEDIA_PORT,

      websocketPath:
        "/api/twilio/stream",

      selectedProvider,

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Media process started"
  );
}

async function drainMediaCalls(): Promise<void> {
  beginMediaDrain();
  const websocketServers = [mediaWebSocketServer, exotelMediaWebSocketServer, plivoMediaWebSocketServer].filter((server): server is WebSocketServer => server !== null);
  const timeoutMs = getMediaDrainTimeoutMs();
  log.info({ event: "media.drain.started", activeStreams: activeMediaStreams(websocketServers), timeoutMs }, "Media drain started");
  const startedAt = Date.now();
  while (websocketServers.some(server => server.clients.size > 0) && Date.now() - startedAt < timeoutMs) await wait(100);
  if (websocketServers.some(server => server.clients.size > 0)) {
    log.warn({ event: "media.drain.timeout", activeStreams: activeMediaStreams(websocketServers), timeoutMs }, "Media drain timeout reached");
    await closeMediaWebSocketClients();
  } else {
    log.info({ event: "media.drain.completed", activeStreams: 0, durationMs: Date.now() - startedAt }, "Media drain completed");
  }
}

//--------------------------------------------------
// Start Media Server
//--------------------------------------------------

function startMediaServer():
  Promise<void> {
  if (
    mediaHttpServer
      ?.listening
  ) {
    return Promise.resolve();
  }

  if (
    serverStarting
  ) {
    return serverStarting;
  }

  serverStarting =
    startMediaServerInternal()
      .finally(
        () => {
          serverStarting =
            null;
        }
      );

  return serverStarting;
}

//--------------------------------------------------
// Internal Media Server Startup
//--------------------------------------------------

async function startMediaServerInternal():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  const server =
    http.createServer(
      handleHttpRequest
    );

  mediaHttpServer =
    server;

  //----------------------------------------
  // Initialize provider-specific WebSocket routes.
  //----------------------------------------

  const {
    initializeTwilioWebSocket,
  } = await import(
    "@/server/twilio-websocket"
  );

  mediaWebSocketServer =
    initializeTwilioWebSocket(
      server
    );

  const {
    initializeExotelWebSocket,
  } = await import(
    "@/server/exotel-websocket"
  );

  exotelMediaWebSocketServer = initializeExotelWebSocket(
    server
  );

  const { initializePlivoWebSocket } = await import("@/server/plivo-websocket");
  plivoMediaWebSocketServer = initializePlivoWebSocket(server);

  //----------------------------------------
  // HTTP Server Errors
  //----------------------------------------

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
              "media.server.port_in_use",

            port:
              MEDIA_PORT,

            error:
              normalizeError(
                error
              ),
          },
          "Media port is already in use"
        );

        return;
      }

      log.error(
        {
          event:
            "media.server.error",

          port:
            MEDIA_PORT,

          error:
            normalizeError(
              error
            ),
        },
        "Media HTTP server error"
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
            "media.server.client_error",

          error:
            normalizeError(
              error
            ),
        },
        "Media HTTP client error"
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

  //----------------------------------------
  // Listen
  //----------------------------------------

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
          MEDIA_PORT
        );
      }
    );
  } catch (
    error
  ) {
    if (
      mediaHttpServer ===
      server
    ) {
      mediaHttpServer =
        null;
    }

    mediaWebSocketServer =
      null;
    exotelMediaWebSocketServer =
      null;
    plivoMediaWebSocketServer = null;

    throw error;
  }

  log.info(
    {
      event:
        "media.server.listening",

      port:
        MEDIA_PORT,

      websocketPath:
        "/api/twilio/stream",

      exotelWebsocketPath:
        "/api/exotel/stream",

      plivoWebsocketPath: "/api/plivo/stream",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Multi-provider media server is listening"
  );
}

//--------------------------------------------------
// HTTP Request Handler
//--------------------------------------------------

async function handleHttpRequest(
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
          "multi-provider-media-server",

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
    const httpReady =
      Boolean(
        mediaHttpServer
          ?.listening
      );

    const websocketReady = mediaWebSocketServer !== null && exotelMediaWebSocketServer !== null && plivoMediaWebSocketServer !== null;

    const configuration = checkIntegrationConfiguration();
    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
    const draining = getMediaLifecycleState() !== "RUNNING";
    const ready = httpReady && websocketReady && database.healthy && redis.healthy && isIntegrationConfigurationReady(configuration) && !draining;

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
          "multi-provider-media-server",

        timestamp:
          new Date()
            .toISOString(),

        dependencies: {
          httpServer: {
            healthy:
              httpReady,
          },

          websocketServer: {
            healthy:
              websocketReady,

            path:
              "/api/twilio/stream",
          },
          exotelWebsocketServer: {
            healthy: exotelMediaWebSocketServer !== null,
            path: "/api/exotel/stream",
          },
          plivoWebsocketServer: { healthy: plivoMediaWebSocketServer !== null, path: "/api/plivo/stream" },
          database,
          redis,
          configuration,
          activeStreams: activeMediaStreams([mediaWebSocketServer, exotelMediaWebSocketServer, plivoMediaWebSocketServer].filter((server): server is WebSocketServer => server !== null)),
          draining,
        },
      }
    );

    return;
  }

  //----------------------------------------
  // All Other HTTP Requests
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
// Send JSON Response
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
// Close Active WebSocket Clients
//--------------------------------------------------

async function closeMediaWebSocketClients():
  Promise<void> {
  const websocketServers = [mediaWebSocketServer, exotelMediaWebSocketServer, plivoMediaWebSocketServer].filter((server): server is WebSocketServer => server !== null);
  if (!websocketServers.length) return;

  const clients = websocketServers.flatMap(websocketServer => Array.from(websocketServer.clients));

  log.info(
    {
      event:
        "media.websocket_clients.close.started",

      activeClients:
        clients.length,
    },
    "Closing media WebSocket clients"
  );

  for (
    const client of clients
  ) {
    if (
      client.readyState ===
      WebSocket.OPEN
    ) {
      client.close(
        1001,
        "Server shutting down"
      );
    }
  }

  await Promise.all(websocketServers.map(websocketServer => waitForWebSocketClients(websocketServer, 2_000)));

  /*
   * Terminate clients that did not complete the
   * close handshake within the grace period.
   */
  for (const websocketServer of websocketServers) for (const client of websocketServer.clients) {
    if (
      client.readyState !==
      WebSocket.CLOSED
    ) {
      client.terminate();
    }
  }

  log.info(
    {
      event:
        "media.websocket_clients.close.completed",

      remainingClients:
        activeMediaStreams(websocketServers),
    },
    "Media WebSocket clients closed"
  );
}

//--------------------------------------------------
// Wait For WebSocket Clients
//--------------------------------------------------

async function waitForWebSocketClients(
  websocketServer:
    WebSocketServer,

  timeoutMs:
    number
): Promise<void> {
  const startedAt =
    Date.now();

  while (
    websocketServer
      .clients
      .size >
      0 &&
    Date.now() -
      startedAt <
      timeoutMs
  ) {
    await wait(
      50
    );
  }
}

function activeMediaStreams(
  websocketServers: WebSocketServer[]
): number {
  return websocketServers.reduce(
    (total, websocketServer) => total + websocketServer.clients.size,
    0
  );
}

//--------------------------------------------------
// Close HTTP Media Server
//--------------------------------------------------

function closeMediaServer():
  Promise<void> {
  if (
    serverClosing
  ) {
    return serverClosing;
  }

  serverClosing =
    closeMediaServerInternal()
      .finally(
        () => {
          serverClosing =
            null;
        }
      );

  return serverClosing;
}

//--------------------------------------------------
// Internal HTTP Server Shutdown
//--------------------------------------------------

async function closeMediaServerInternal():
  Promise<void> {
  const server =
    mediaHttpServer;

  if (
    !server
  ) {
    return;
  }

  const startedAt =
    process.hrtime.bigint();

  mediaHttpServer =
    null;
  markMediaTerminated();

  /*
   * twilio-websocket.ts closes its WebSocketServer
   * when the owning HTTP server emits "close".
   */
  mediaWebSocketServer =
    null;
  exotelMediaWebSocketServer =
    null;
  plivoMediaWebSocketServer = null;

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
        "media.server.close.completed",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Media HTTP server closed"
  );
}

async function checkDatabase(): Promise<{ healthy: boolean }> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return { healthy: true };
  } catch { return { healthy: false }; }
}

async function checkRedis(): Promise<{ healthy: boolean }> {
  try {
    const { redisConnection } = await import("@/lib/redis");
    return { healthy: await redisConnection.ping() === "PONG" };
  } catch { return { healthy: false }; }
}

//--------------------------------------------------
// Parse Media Port
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
      : 3001;

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
      `Invalid TWILIO_MEDIA_PORT value: ${rawValue}`
    );
  }

  return parsed;
}

//--------------------------------------------------
// Small Delay
//--------------------------------------------------

function wait(
  milliseconds:
    number
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
