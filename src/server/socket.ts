import {
  Server as HttpServer,
} from "http";

import {
  Server,
} from "socket.io";

let io: Server | null =
  null;

export function initializeSocket(
  server: HttpServer
) {
  if (io) {
    console.log(
      "⚡ Socket already initialized"
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
          origin: "*",

          methods: [
            "GET",
            "POST",
          ],
        },

        /*
         * Prevent Engine.IO from destroying
         * WebSocket upgrades that belong to
         * Twilio or Next.js.
         */
        destroyUpgrade:
          false,
      }
    );

  io.on(
    "connection",
    (
      socket
    ) => {
      console.log(
        `🟢 Dashboard Connected: ${socket.id}`
      );

      socket.on(
        "disconnect",
        (
          reason
        ) => {
          console.log(
            `🔴 Dashboard Disconnected: ${socket.id}`,
            {
              reason,
            }
          );
        }
      );
    }
  );

  console.log(
    "🚀 Socket.IO Initialized"
  );

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error(
      "Socket.IO not initialized. Call initializeSocket() first."
    );
  }

  return io;
}