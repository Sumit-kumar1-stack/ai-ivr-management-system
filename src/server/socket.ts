import {
  Server as HttpServer,
} from "http";

import {
  Server,
} from "socket.io";

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
    "socket-server"
  );

//--------------------------------------------------
// Socket.IO State
//--------------------------------------------------

let io:
  Server |
  null =
    null;

//--------------------------------------------------
// Initialize Socket.IO
//--------------------------------------------------

export function initializeSocket(
  server: HttpServer
): Server {
  if (
    io
  ) {
    log.debug(
      {
        event:
          "socket.initialize.skipped",

        reason:
          "already_initialized",
      },
      "Socket.IO is already initialized"
    );

    return io;
  }

  io =
    new Server(
      server,
      {
        path:
          "/socket.io",

        cors: {
          origin:
            "*",

          methods: [
            "GET",
            "POST",
          ],
        },

        /*
         * Use polling only so Socket.IO does not
         * compete with the Twilio WebSocket server.
         */
        transports: [
          "polling",
        ],

        allowUpgrades:
          false,
      }
    );

  io.on(
    "connection",
    socket => {
      log.info(
        {
          event:
            "socket.client.connected",

          socketId:
            socket.id,

          transport:
            socket.conn
              .transport
              .name,

          connectedClients:
            io?.engine
              .clientsCount ??
            0,
        },
        "Dashboard socket connected"
      );

      socket.on(
        "disconnect",
        reason => {
          log.info(
            {
              event:
                "socket.client.disconnected",

              socketId:
                socket.id,

              reason,

              connectedClients:
                io?.engine
                  .clientsCount ??
                0,
            },
            "Dashboard socket disconnected"
          );
        }
      );

      socket.on(
        "error",
        error => {
          log.warn(
            {
              event:
                "socket.client.error",

              socketId:
                socket.id,

              error:
                normalizeError(
                  error
                ),
            },
            "Dashboard socket error"
          );
        }
      );
    }
  );

  log.info(
    {
      event:
        "socket.initialize.completed",

      path:
        "/socket.io",

      transports: [
        "polling",
      ],

      upgradesAllowed:
        false,
    },
    "Socket.IO initialized"
  );

  return io;
}

//--------------------------------------------------
// Get Socket.IO
//--------------------------------------------------

export function getIO():
  Server {
  if (
    !io
  ) {
    throw new Error(
      "Socket.IO not initialized. Call initializeSocket() first."
    );
  }

  return io;
}

//--------------------------------------------------
// Socket.IO State
//--------------------------------------------------

export function isSocketServerInitialized():
  boolean {
  return io !==
    null;
}

//--------------------------------------------------
// Close Socket.IO
//--------------------------------------------------

export async function closeSocketServer():
  Promise<void> {
  if (
    !io
  ) {
    log.debug(
      {
        event:
          "socket.close.skipped",

        reason:
          "not_initialized",
      },
      "Socket.IO is not initialized"
    );

    return;
  }

  const startedAt =
    process.hrtime.bigint();

  const socketServer =
    io;

  /*
   * Clear the module reference first so no new code
   * treats the server as available during shutdown.
   */
  io =
    null;

  log.info(
    {
      event:
        "socket.close.started",

      connectedClients:
        socketServer.engine
          .clientsCount,
    },
    "Socket.IO shutdown started"
  );

  try {
    await new Promise<void>(
      (
        resolve,
        reject
      ) => {
        socketServer.close(
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
      }
    );

    log.info(
      {
        event:
          "socket.close.completed",

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Socket.IO closed"
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "socket.close.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Socket.IO shutdown failed"
    );

    throw error;
  }
}