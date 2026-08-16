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

import {
  authenticateSocket,
  getAllowedSocketOrigins,
} from "@/server/socket-auth";

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

  const allowedOrigins =
    Array.from(
      getAllowedSocketOrigins()
    );

  io =
    new Server(
      server,
      {
        path:
          "/socket.io",

        cors: {
          origin(
            origin,
            callback
          ) {
            /*
             * Non-browser clients may not send Origin.
             * Production browser connections are also
             * checked again by socket middleware.
             */
            if (
              !origin &&
              process.env.NODE_ENV !==
                "production"
            ) {
              callback(
                null,
                true
              );

              return;
            }

            if (
              origin &&
              allowedOrigins.includes(
                normalizeOrigin(
                  origin
                )
              )
            ) {
              callback(
                null,
                true
              );

              return;
            }

            callback(
              new Error(
                "Socket origin is not allowed"
              )
            );
          },

          methods: [
            "GET",
            "POST",
          ],

          credentials:
            true,
        },

        transports: [
          "polling",
        ],

        allowUpgrades:
          false,
      }
    );

  //----------------------------------------
  // Authentication Middleware
  //----------------------------------------

  io.use(
    async (
      socket,
      next
    ) => {
      try {
        const {
          user,
        } =
          await authenticateSocket(
            socket
          );

        socket.data.user =
          user;

        next();
      } catch (
        error
      ) {
        log.warn(
          {
            event:
              "socket.authentication.rejected",

            socketId:
              socket.id,

            origin:
              socket.handshake
                .headers
                .origin,

            address:
              socket.handshake
                .address,

            error:
              normalizeError(
                error
              ),
          },
          "Dashboard socket authentication rejected"
        );

        next(
          new Error(
            "Authentication required"
          )
        );
      }
    }
  );

  //----------------------------------------
  // Connection Handler
  //----------------------------------------

  io.on(
    "connection",
    socket => {
      const user =
        socket.data.user as
          | {
              id: string;
              fullName: string;
              email: string;
              role: string;
            }
          | undefined;

      log.info(
        {
          event:
            "socket.client.connected",

          socketId:
            socket.id,

          userId:
            user?.id,

          role:
            user?.role,

          transport:
            socket.conn
              .transport
              .name,

          connectedClients:
            io?.engine
              .clientsCount ??
            0,
        },
        "Authenticated dashboard socket connected"
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

              userId:
                user?.id,

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

              userId:
                user?.id,

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

      authenticationRequired:
        true,

      allowedOrigins,
    },
    "Authenticated Socket.IO initialized"
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

  /*
   * Disconnect application sockets first.
   *
   * With HTTP long polling, active clients may keep
   * pending requests open and prevent close() from
   * completing promptly.
   */
  try {
    socketServer.disconnectSockets(
      true
    );
  } catch (
    error
  ) {
    log.warn(
      {
        event:
          "socket.clients.disconnect_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Socket.IO clients could not be disconnected cleanly"
    );
  }

  /*
   * Force-close any remaining Engine.IO transports.
   */
  try {
    socketServer.engine.close();
  } catch (
    error
  ) {
    log.warn(
      {
        event:
          "socket.engine.close_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Socket.IO Engine.IO shutdown failed"
    );
  }

  try {
    await closeSocketServerWithTimeout(
      socketServer,
      5_000
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
    /*
     * Socket.IO has already been detached from the
     * public module state and all known clients were
     * disconnected. Do not block the whole process
     * shutdown if its close callback is delayed.
     */
    log.warn(
      {
        event:
          "socket.close.forced",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Socket.IO close timed out; shutdown continued"
    );
  }
}

//--------------------------------------------------
// Close Socket.IO With Timeout
//--------------------------------------------------

function closeSocketServerWithTimeout(
  socketServer:
    Server,

  timeoutMs:
    number
): Promise<void> {
  return new Promise<void>(
    (
      resolve,
      reject
    ) => {
      let settled =
        false;

      const finish =
        (
          error?:
            Error
        ) => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          clearTimeout(
            timeout
          );

          if (
            error
          ) {
            reject(
              error
            );

            return;
          }

          resolve();
        };

      const timeout =
        setTimeout(
          () => {
            finish(
              new Error(
                `Socket.IO shutdown exceeded ${timeoutMs}ms`
              )
            );
          },
          timeoutMs
        );

      /*
       * This timer must not keep the Node.js process
       * alive by itself.
       */
      timeout.unref();

      try {
        socketServer.close(
          error => {
            finish(
              error ??
                undefined
            );
          }
        );
      } catch (
        error
      ) {
        finish(
          error instanceof
            Error
            ? error
            : new Error(
                String(
                  error
                )
              )
        );
      }
    }
  );
}

//--------------------------------------------------
// Normalize Origin
//--------------------------------------------------

function normalizeOrigin(
  value: string
): string {
  try {
    return new URL(
      value
    ).origin;
  } catch {
    return "";
  }
}