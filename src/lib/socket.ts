"use client";

import {
  io,
  Socket,
} from "socket.io-client";

//--------------------------------------------------
// Shared Socket State
//--------------------------------------------------

let socketInstance:
  Socket |
  null =
    null;

//--------------------------------------------------
// Get Shared Socket
//--------------------------------------------------

export function getSocket():
  Socket {
  if (
    !socketInstance
  ) {
    socketInstance =
      io({
        path:
          "/socket.io",

        transports: [
          "polling",
        ],

        upgrade:
          false,

        autoConnect:
          false,

        reconnection:
          true,

        withCredentials:
          true,

        reconnectionAttempts:
          10,

        reconnectionDelay:
          1000,

        timeout:
          20000,
      });
  }

  return socketInstance;
}

//--------------------------------------------------
// Connect Socket
//--------------------------------------------------

export function connectSocket():
  Socket {
  const socket =
    getSocket();

  if (
    !socket.connected &&
    !socket.active
  ) {
    socket.connect();
  }

  return socket;
}

//--------------------------------------------------
// Reconnect Socket After Login
//--------------------------------------------------

export function reconnectSocket():
  Socket {
  const socket =
    getSocket();

  /*
   * A previous unauthenticated connection may have
   * failed before the login cookie existed.
   *
   * Disconnect first so the next handshake includes
   * the newly created authentication cookie.
   */
  if (
    socket.connected ||
    socket.active
  ) {
    socket.disconnect();
  }

  socket.connect();

  return socket;
}

//--------------------------------------------------
// Disconnect Shared Socket
//--------------------------------------------------

export function disconnectSocket():
  void {
  if (
    !socketInstance
  ) {
    return;
  }

  socketInstance.disconnect();
}