import WebSocket from "ws";

import {
  DeepgramEvents,
} from "./deepgram.events";

interface DeepgramSession {
  callId: string;

  socket: WebSocket;
}

const sessions =
  new Map<
    string,
    DeepgramSession
  >();

export class DeepgramSocket {
  //---------------------------------------
  // Connect
  //---------------------------------------

  static async connect(
    callId: string
  ): Promise<void> {
    const existingSession =
      sessions.get(
        callId
      );

    if (
      existingSession?.socket
        .readyState ===
      WebSocket.OPEN
    ) {
      return;
    }

    if (
      existingSession?.socket
        .readyState ===
      WebSocket.CONNECTING
    ) {
      await this.waitUntilOpen(
        callId,
        existingSession.socket
      );

      return;
    }

    const apiKey =
      process.env
        .DEEPGRAM_API_KEY;

    if (!apiKey) {
      throw new Error(
        "DEEPGRAM_API_KEY is missing"
      );
    }

    const socket =
      new WebSocket(
        [
          "wss://api.deepgram.com/v1/listen",
          "?model=nova-3",
          "&encoding=mulaw",
          "&sample_rate=8000",
          "&channels=1",
          "&interim_results=true",
          "&endpointing=300",
        ].join(""),
        {
          headers: {
            Authorization:
              `Token ${apiKey}`,
          },
        }
      );

    sessions.set(
      callId,
      {
        callId,
        socket,
      }
    );

    //---------------------------------------
    // Messages
    //---------------------------------------

    socket.on(
      "message",
      async (
        message
      ) => {
        try {
          const data =
            JSON.parse(
              message.toString()
            );

          await DeepgramEvents.handle(
            callId,
            data
          );
        } catch (error) {
          console.error(
            `Deepgram message processing failed (${callId})`,
            error
          );
        }
      }
    );

    //---------------------------------------
    // Close
    //---------------------------------------

    socket.on(
      "close",
      (
        code,
        reason
      ) => {
        console.log(
          `❌ Deepgram Closed (${callId})`,
          {
            code,

            reason:
              reason.toString(),
          }
        );

        const currentSession =
          sessions.get(
            callId
          );

        if (
          currentSession
            ?.socket ===
          socket
        ) {
          sessions.delete(
            callId
          );
        }
      }
    );

    //---------------------------------------
    // Error
    //---------------------------------------

    socket.on(
      "error",
      (
        error
      ) => {
        console.error(
          `Deepgram Error (${callId})`,
          error
        );
      }
    );

    //---------------------------------------
    // Wait for actual connection
    //---------------------------------------

    await this.waitUntilOpen(
      callId,
      socket
    );

    console.log(
      `✅ Deepgram Connected (${callId})`
    );
  }

  //---------------------------------------
  // Wait until open
  //---------------------------------------

  private static waitUntilOpen(
    callId: string,
    socket: WebSocket,
    timeoutMs = 10000
  ): Promise<void> {
    return new Promise(
      (
        resolve,
        reject
      ) => {
        if (
          socket.readyState ===
          WebSocket.OPEN
        ) {
          resolve();

          return;
        }

        const timeout =
          setTimeout(
            () => {
              cleanup();

              reject(
                new Error(
                  `Deepgram connection timed out for call ${callId}`
                )
              );
            },
            timeoutMs
          );

        const handleOpen =
          () => {
            cleanup();

            resolve();
          };

        const handleError =
          (
            error: Error
          ) => {
            cleanup();

            reject(
              error
            );
          };

        const handleClose =
          (
            code: number,
            reason: Buffer
          ) => {
            cleanup();

            reject(
              new Error(
                `Deepgram closed before opening for call ${callId}. Code: ${code}, reason: ${reason.toString()}`
              )
            );
          };

        const cleanup =
          () => {
            clearTimeout(
              timeout
            );

            socket.off(
              "open",
              handleOpen
            );

            socket.off(
              "error",
              handleError
            );

            socket.off(
              "close",
              handleClose
            );
          };

        socket.once(
          "open",
          handleOpen
        );

        socket.once(
          "error",
          handleError
        );

        socket.once(
          "close",
          handleClose
        );
      }
    );
  }

  //---------------------------------------
  // Send Audio
  //---------------------------------------

  static async sendAudio(
    callId: string,
    audio: Buffer
  ): Promise<boolean> {
    const session =
      sessions.get(
        callId
      );

    if (!session) {
      console.warn(
        `No Deepgram session for call ${callId}`
      );

      return false;
    }

    if (
      session.socket
        .readyState !==
      WebSocket.OPEN
    ) {
      console.warn(
        `Deepgram socket is not open for call ${callId}`
      );

      return false;
    }

    if (
      !Buffer.isBuffer(
        audio
      ) ||
      audio.length === 0
    ) {
      return false;
    }

    session.socket.send(
      audio
    );

    return true;
  }

  //---------------------------------------
  // Close
  //---------------------------------------

  static async close(
    callId: string
  ): Promise<void> {
    const session =
      sessions.get(
        callId
      );

    if (!session) {
      return;
    }

    sessions.delete(
      callId
    );

    if (
      session.socket
        .readyState ===
        WebSocket.OPEN ||
      session.socket
        .readyState ===
        WebSocket.CONNECTING
    ) {
      session.socket.close(
        1000,
        "Call completed"
      );
    }
  }

  //---------------------------------------
  // Connected
  //---------------------------------------

  static isConnected(
    callId: string
  ): boolean {
    const session =
      sessions.get(
        callId
      );

    return (
      session?.socket
        .readyState ===
      WebSocket.OPEN
    );
  }
}