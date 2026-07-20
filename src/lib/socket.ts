"use client";

import {
  io,
  Socket,
} from "socket.io-client";

let socketInstance: Socket | null =
  null;

export function getSocket(): Socket {

  if (!socketInstance) {

    socketInstance = io({
      path: "/socket.io",
      transports: [
        "websocket",
        "polling",
      ],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

  }

  return socketInstance;
}