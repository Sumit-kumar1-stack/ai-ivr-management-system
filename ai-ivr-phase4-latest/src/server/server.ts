import http from "http";

import next from "next";

import {
  initializeSocket,
} from "./socket";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "http-server"
  );

//--------------------------------------------------
// Server Configuration
//--------------------------------------------------

const development =
  process.env.NODE_ENV !==
  "production";

const PORT =
  parsePort(
    process.env.PORT
  );

//--------------------------------------------------
// Server State
//--------------------------------------------------

let httpServer:
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
// Start Custom Next.js Server
//--------------------------------------------------

export function startServer():
  Promise<void> {
  if (
    httpServer?.listening
  ) {
    log.debug(
      {
        event:
          "server.startup.skipped",

        reason:
          "already_listening",

        port:
          PORT,
      },
      "HTTP server is already listening"
    );

    return Promise.resolve();
  }

  if (
    serverStarting
  ) {
    return serverStarting;
  }

  serverStarting =
    startServerInternal()
      .finally(
        () => {
          serverStarting =
            null;
        }
      );

  return serverStarting;
}

//--------------------------------------------------
// Internal Server Startup
//--------------------------------------------------

async function startServerInternal():
  Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "server.startup.started",

      environment:
        development
          ? "development"
          : "production",

      port:
        PORT,
    },
    "HTTP server startup started"
  );

  //----------------------------------------
  // Create Next.js Application
  //----------------------------------------

  const app =
    next({
      dev:
        development,
    });

  await app.prepare();

  const handle =
    app.getRequestHandler();

  const handleUpgrade =
    app.getUpgradeHandler();

  log.info(
    {
      event:
        "server.next.prepared",
    },
    "Next.js application prepared"
  );

  //----------------------------------------
  // Create HTTP Server
  //----------------------------------------

  const server =
    http.createServer(
      (
        request,
        response
      ) => {
        const requestStartedAt =
          process.hrtime.bigint();

        handle(
          request,
          response
        ).catch(
          (
            error: unknown
          ) => {
            log.error(
              {
                event:
                  "server.request.failed",

                method:
                  request.method,

                url:
                  request.url,

                durationMs:
                  getDurationMs(
                    requestStartedAt
                  ),

                error:
                  normalizeError(
                    error
                  ),
              },
              "Next.js request handling failed"
            );

            if (
              !response.headersSent
            ) {
              response.statusCode =
                500;

              response.end(
                "Internal Server Error"
              );

              return;
            }

            if (
              !response.writableEnded
            ) {
              response.end();
            }
          }
        );
      }
    );

  httpServer =
    server;

  //----------------------------------------
  // Next.js Development HMR
  //----------------------------------------

  if (
    development
  ) {
    server.on(
      "upgrade",
      (
        request,
        socket,
        head
      ) => {
        try {
          handleUpgrade(
            request,
            socket,
            head
          );
        } catch (
          error
        ) {
          log.error(
            {
              event:
                "server.upgrade.failed",

              url:
                request.url,

              error:
                normalizeError(
                  error
                ),
            },
            "HTTP upgrade handling failed"
          );

          socket.destroy();
        }
      }
    );
  }

  //----------------------------------------
  // Dashboard Socket.IO
  //----------------------------------------

  initializeSocket(
    server
  );

  log.info(
    {
      event:
        "server.socket.initialized",
    },
    "Socket.IO initialized"
  );

  //----------------------------------------
  // Server Error Handling
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
              "server.port.in_use",

            port:
              PORT,

            error:
              normalizeError(
                error
              ),
          },
          "Configured port is already in use"
        );

        return;
      }

      log.error(
        {
          event:
            "server.error",

          port:
            PORT,

          error:
            normalizeError(
              error
            ),
        },
        "HTTP server error"
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
            "server.client_error",

          error:
            normalizeError(
              error
            ),
        },
        "HTTP client connection error"
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
  // Start Listening
  //----------------------------------------

  try {
    await new Promise<void>(
      (
        resolve,
        reject
      ) => {
        const handleStartupError =
          (
            error: Error
          ) => {
            server.off(
              "listening",
              handleListening
            );

            reject(
              error
            );
          };

        const handleListening =
          () => {
            server.off(
              "error",
              handleStartupError
            );

            resolve();
          };

        server.once(
          "error",
          handleStartupError
        );

        server.once(
          "listening",
          handleListening
        );

        server.listen(
          PORT
        );
      }
    );
  } catch (
    error
  ) {
    if (
      httpServer ===
      server
    ) {
      httpServer =
        null;
    }

    throw error;
  }

  log.info(
    {
      event:
        "server.listening",

      environment:
        development
          ? "development"
          : "production",

      port:
        PORT,

      upgradeListenerCount:
        server.listenerCount(
          "upgrade"
        ),

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
    "HTTP server is listening"
  );
}

//--------------------------------------------------
// Server State
//--------------------------------------------------

export function isHttpServerListening():
  boolean {
  return Boolean(
    httpServer?.listening
  );
}

//--------------------------------------------------
// Close HTTP Server
//--------------------------------------------------

export function closeHttpServer():
  Promise<void> {
  if (
    serverClosing
  ) {
    return serverClosing;
  }

  serverClosing =
    closeHttpServerInternal()
      .finally(
        () => {
          serverClosing =
            null;
        }
      );

  return serverClosing;
}

//--------------------------------------------------
// Internal HTTP Shutdown
//--------------------------------------------------

async function closeHttpServerInternal():
  Promise<void> {
  const server =
    httpServer;

  if (
    !server
  ) {
    log.debug(
      {
        event:
          "server.close.skipped",

        reason:
          "not_initialized",
      },
      "HTTP server is not initialized"
    );

    return;
  }

  const startedAt =
    process.hrtime.bigint();

  /*
   * Remove the public module reference before
   * beginning shutdown.
   */
  httpServer =
    null;

  log.info(
    {
      event:
        "server.close.started",

      listening:
        server.listening,

      connectionCount:
        await getServerConnectionCount(
          server
        ),
    },
    "HTTP server shutdown started"
  );

  try {
    if (
      server.listening
    ) {
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

          /*
           * Stop keep-alive connections after active
           * requests have been given a chance to end.
           */
          server.closeIdleConnections?.();
        }
      );
    }

    log.info(
      {
        event:
          "server.close.completed",

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "HTTP server closed"
    );
  } catch (
    error
  ) {
    /*
     * Force remaining connections closed when the
     * normal close operation fails.
     */
    server.closeAllConnections?.();

    log.error(
      {
        event:
          "server.close.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "HTTP server shutdown failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Connection Count
//--------------------------------------------------

function getServerConnectionCount(
  server: http.Server
): Promise<number> {
  return new Promise(
    resolve => {
      server.getConnections(
        (
          error,
          count
        ) => {
          if (
            error
          ) {
            resolve(
              0
            );

            return;
          }

          resolve(
            count
          );
        }
      );
    }
  );
}

//--------------------------------------------------
// Parse Port
//--------------------------------------------------

function parsePort(
  rawValue:
    | string
    | undefined
): number {
  const normalized =
    rawValue?.trim();

  const parsed =
    normalized
      ? Number(
          normalized
        )
      : 3000;

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
      `Invalid PORT value: ${rawValue}`
    );
  }

  return parsed;
}
