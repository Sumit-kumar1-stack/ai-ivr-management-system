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
): Server {

  if (
    io
  ) {

    console.log(
      "⚡ Socket.IO already initialized"
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
         * IMPORTANT:
         *
         * Use HTTP long-polling only.
         *
         * This prevents Socket.IO/Engine.IO from
         * registering a competing WebSocket upgrade
         * handler on the same HTTP server used by
         * Twilio Media Streams.
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

      console.log(
        `🟢 Dashboard Connected: ${socket.id}`,
        {
          transport:
            socket.conn
              .transport
              .name,
        }
      );


      socket.on(
        "disconnect",
        reason => {

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
    "🚀 Socket.IO initialized using polling transport"
  );


  return io;

}


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