import { Server as HttpServer } from "http";

import { Server } from "socket.io";

let io: Server | null = null;

export function initializeSocket(
  server: HttpServer
) {

  if (io) {
    return io;
  }

  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {

    console.log(
      `🟢 Dashboard Connected: ${socket.id}`
    );

    socket.on(
      "disconnect",
      () => {

        console.log(
          `🔴 Dashboard Disconnected: ${socket.id}`
        );

      }
    );

  });

  return io;

}

export function getIO() {

  if (!io) {

    throw new Error(
      "Socket.IO not initialized."
    );

  }

  return io;

}