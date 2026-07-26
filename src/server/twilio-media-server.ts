import {
  loadEnvConfig,
} from "@next/env";

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

import {
  registerProcessLifecycle,
} from "@/server/process-lifecycle";

//--------------------------------------------------
// Load Environment First
//--------------------------------------------------

loadEnvConfig(
  process.cwd()
);

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "twilio-media-process"
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

async function startMediaProcess():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "media.process.start.started",

      port:
        MEDIA_PORT,
    },
    "Twilio media process startup started"
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

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Twilio media process started"
  );
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
  // Initialize Signed Twilio WebSocket
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
          "Twilio media port is already in use"
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
        "Twilio media HTTP server error"
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
        "Twilio media HTTP client error"
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

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Twilio media server is listening"
  );
}

//--------------------------------------------------
// HTTP Request Handler
//--------------------------------------------------

function handleHttpRequest(
  request:
    IncomingMessage,

  response:
    ServerResponse
): void {
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
          "twilio-media-server",

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

    const websocketReady =
      mediaWebSocketServer !==
      null;

    const ready =
      httpReady &&
      websocketReady;

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
          "twilio-media-server",

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
  const websocketServer =
    mediaWebSocketServer;

  if (
    !websocketServer
  ) {
    return;
  }

  const clients =
    Array.from(
      websocketServer.clients
    );

  log.info(
    {
      event:
        "media.websocket_clients.close.started",

      activeClients:
        clients.length,
    },
    "Closing Twilio media WebSocket clients"
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

  await waitForWebSocketClients(
    websocketServer,
    2_000
  );

  /*
   * Terminate clients that did not complete the
   * close handshake within the grace period.
   */
  for (
    const client of
    websocketServer.clients
  ) {
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
        websocketServer
          .clients
          .size,
    },
    "Twilio media WebSocket clients closed"
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

  /*
   * twilio-websocket.ts closes its WebSocketServer
   * when the owning HTTP server emits "close".
   */
  mediaWebSocketServer =
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
        "media.server.close.completed",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "Twilio media HTTP server closed"
  );
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
// Start Entry Point
//--------------------------------------------------

startMediaProcess().catch(
  (
    error:
      unknown
  ) => {
    log.fatal(
      {
        event:
          "media.process.start.failed",

        port:
          MEDIA_PORT,

        error:
          normalizeError(
            error
          ),
      },
      "Twilio media process startup failed"
    );

    process.exit(
      1
    );
  }
);