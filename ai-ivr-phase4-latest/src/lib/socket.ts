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

        // Prefer WebSocket.
        // Fall back to HTTP polling if WebSocket
        // is unavailable.
        transports: [
          "websocket",
          "polling",
        ],

        // Allow Socket.IO to upgrade from polling
        // to WebSocket when possible.
        upgrade:
          true,

        // Connection is controlled explicitly by
        // connectSocket() / reconnectSocket().
        autoConnect:
          false,

        // Automatically reconnect after an
        // unexpected disconnection.
        reconnection:
          true,

        // Send authentication cookies with the
        // Socket.IO handshake.
        withCredentials:
          true,

        // Maximum automatic reconnection attempts.
        reconnectionAttempts:
          10,

        // Wait 1 second before reconnecting.
        reconnectionDelay:
          1000,

        // Connection timeout.
        timeout:
          20000,
      });

    //------------------------------------------------
    // Connection Events
    //------------------------------------------------

    socketInstance.on(
      "connect",
      () => {
        console.log(
          "[Socket.IO] Connected",
          {
            socketId:
              socketInstance?.id,

            transport:
              socketInstance?.io
                .engine
                .transport
                .name,
          }
        );
      }
    );

    //------------------------------------------------
    // Connection Error
    //------------------------------------------------

    socketInstance.on(
      "connect_error",
      error => {
        console.error(
          "[Socket.IO] Connection error:",
          error.message
        );
      }
    );

    //------------------------------------------------
    // Disconnect
    //------------------------------------------------

    socketInstance.on(
      "disconnect",
      reason => {
        console.warn(
          "[Socket.IO] Disconnected:",
          reason
        );
      }
    );

    //------------------------------------------------
    // Reconnect Attempt
    //------------------------------------------------

    socketInstance.io.on(
      "reconnect_attempt",
      attempt => {
        console.log(
          "[Socket.IO] Reconnect attempt:",
          attempt
        );
      }
    );

    //------------------------------------------------
    // Reconnect
    //------------------------------------------------

    socketInstance.io.on(
      "reconnect",
      attempt => {
        console.log(
          "[Socket.IO] Reconnected",
          {
            attempt,
            socketId:
              socketInstance?.id,
          }
        );
      }
    );

    //------------------------------------------------
    // Reconnect Failed
    //------------------------------------------------

    socketInstance.io.on(
      "reconnect_failed",
      () => {
        console.error(
          "[Socket.IO] Reconnection failed"
        );
      }
    );
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
    console.log(
      "[Socket.IO] Connecting..."
    );

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
   * A previous unauthenticated connection may
   * have failed before the login cookie existed.
   *
   * Disconnect first so the next handshake
   * includes the newly created authentication
   * cookie.
   */

  if (
    socket.connected ||
    socket.active
  ) {
    console.log(
      "[Socket.IO] Resetting connection before login reconnect"
    );

    socket.disconnect();
  }

  console.log(
    "[Socket.IO] Reconnecting after authentication..."
  );

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

  console.log(
    "[Socket.IO] Disconnecting..."
  );

  socketInstance.disconnect();
}