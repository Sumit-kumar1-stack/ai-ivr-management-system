import WebSocket from "ws";

import {
  createCallLogger,
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  DeepgramEvents,
  DeepgramPayload,
} from "./deepgram.events";

//--------------------------------------------------
// Deepgram Session
//--------------------------------------------------

interface DeepgramSession {
  callId: string;

  socket: WebSocket;

  /*
   * Twilio may begin sending media packets before
   * the Deepgram WebSocket reaches OPEN.
   *
   * These packets are preserved here and flushed
   * in their original order once Deepgram connects.
   */
  pendingAudio: Buffer[];

  pendingAudioBytes: number;

  flushingAudio: boolean;

  waitingLogWritten: boolean;
}

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "deepgram-socket"
  );

//--------------------------------------------------
// Session Store
//--------------------------------------------------

const sessions =
  new Map<
    string,
    DeepgramSession
  >();

//--------------------------------------------------
// Buffer Configuration
//--------------------------------------------------

/*
 * Twilio commonly sends approximately 160 bytes
 * every 20 ms for 8 kHz μ-law audio.
 *
 * A 5-second buffer therefore needs roughly 40 KB.
 * We use a slightly larger default to provide a
 * safe margin while Deepgram establishes a socket.
 */
const DEFAULT_MAX_BUFFER_BYTES =
  64 * 1024;

const MAX_BUFFER_BYTES =
  getPositiveIntegerEnvironmentValue(
    "DEEPGRAM_AUDIO_BUFFER_MAX_BYTES",
    DEFAULT_MAX_BUFFER_BYTES
  );

//--------------------------------------------------
// Deepgram Socket
//--------------------------------------------------

export class DeepgramSocket {
  //---------------------------------------
  // Connect
  //---------------------------------------

  static async connect(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    const existingSession =
      sessions.get(
        callId
      );

    //-------------------------------------
    // Already Connected
    //-------------------------------------

    if (
      existingSession?.socket
        .readyState ===
      WebSocket.OPEN
    ) {
      this.flushPendingAudio(
        existingSession
      );

      log.debug(
        {
          event:
            "deepgram.connection.reused",

          readyState:
            existingSession.socket
              .readyState,
        },
        "Existing Deepgram connection reused"
      );

      return;
    }

    //-------------------------------------
    // Connection Already In Progress
    //-------------------------------------

    if (
      existingSession?.socket
        .readyState ===
      WebSocket.CONNECTING
    ) {
      log.debug(
        {
          event:
            "deepgram.connection.waiting",

          timeoutMs:
            10_000,
        },
        "Waiting for existing Deepgram connection"
      );

      await this.waitUntilOpen(
        callId,
        existingSession.socket
      );

      this.flushPendingAudio(
        existingSession
      );

      return;
    }

    //-------------------------------------
    // Validate Configuration
    //-------------------------------------

    const apiKey =
      process.env
        .DEEPGRAM_API_KEY
        ?.trim();

    if (
      !apiKey
    ) {
      throw new Error(
        "DEEPGRAM_API_KEY is missing"
      );
    }

    //-------------------------------------
    // Create Deepgram WebSocket
    //-------------------------------------

    const socket =
  new WebSocket(
    [
      "wss://api.deepgram.com/v1/listen",
      "?model=nova-3",
      "&encoding=mulaw",
      "&sample_rate=8000",
      "&channels=1",
      "&interim_results=true",
      "&endpointing=700",
      "&utterance_end_ms=1200",
    ].join(
      ""
    ),
        {
          headers: {
            Authorization:
              `Token ${apiKey}`,
          },
        }
      );

    const session:
      DeepgramSession = {
        callId,

        socket,

        pendingAudio:
          [],

        pendingAudioBytes:
          0,

        flushingAudio:
          false,

        waitingLogWritten:
          false,
      };

    sessions.set(
      callId,
      session
    );

    log.info(
      {
        event:
          "deepgram.connection.started",

        maximumBufferBytes:
          MAX_BUFFER_BYTES,
      },
      "Deepgram connection started"
    );

    //---------------------------------------
    // Open
    //---------------------------------------

    socket.on(
      "open",
      () => {
        const currentSession =
          sessions.get(
            callId
          );

        if (
          !currentSession ||
          currentSession.socket !==
            socket
        ) {
          return;
        }

        log.info(
          {
            event:
              "deepgram.connection.opened",

            bufferedPackets:
              currentSession
                .pendingAudio
                .length,

            bufferedBytes:
              currentSession
                .pendingAudioBytes,
          },
          "Deepgram connection opened"
        );

        this.flushPendingAudio(
          currentSession
        );
      }
    );

    //---------------------------------------
    // Messages
    //---------------------------------------

    socket.on(
      "message",
      async message => {
        const messageSizeBytes =
          Buffer.byteLength(
            message.toString(),
            "utf8"
          );

        try {
          const data =
  JSON.parse(
    message.toString()
  ) as DeepgramPayload;

          await DeepgramEvents.handle(
            callId,
            data
          );
        } catch (
          error
        ) {
          /*
           * Never log the message payload because it
           * may contain speech transcripts.
           */
          log.error(
            {
              event:
                "deepgram.message.processing_failed",

              messageSizeBytes,

              error:
                normalizeError(
                  error
                ),
            },
            "Deepgram message processing failed"
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
        log.info(
          {
            event:
              "deepgram.connection.closed",

            code,

            reasonLength:
              reason.length,
          },
          "Deepgram connection closed"
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
          const removedPackets =
            currentSession
              .pendingAudio
              .length;

          const removedBytes =
            currentSession
              .pendingAudioBytes;

          this.clearPendingAudio(
            currentSession
          );

          sessions.delete(
            callId
          );

          log.debug(
            {
              event:
                "deepgram.session.removed",

              removedPackets,

              removedBytes,
            },
            "Deepgram session removed"
          );
        }
      }
    );

    //---------------------------------------
    // Error
    //---------------------------------------

    socket.on(
      "error",
      error => {
        log.error(
          {
            event:
              "deepgram.connection.error",

            error:
              normalizeError(
                error
              ),
          },
          "Deepgram connection error"
        );
      }
    );

    //---------------------------------------
    // Wait For Actual Connection
    //---------------------------------------

    try {
      await this.waitUntilOpen(
        callId,
        socket
      );

      /*
       * The open event normally performs this flush.
       * Calling it here as well is safe and protects
       * against event-ordering edge cases.
       */
      const currentSession =
        sessions.get(
          callId
        );

      if (
        currentSession?.socket ===
        socket
      ) {
        this.flushPendingAudio(
          currentSession
        );
      }
    } catch (
      error
    ) {
      const currentSession =
        sessions.get(
          callId
        );

      if (
        currentSession?.socket ===
        socket
      ) {
        this.clearPendingAudio(
          currentSession
        );

        sessions.delete(
          callId
        );
      }

      if (
        socket.readyState ===
          WebSocket.OPEN ||
        socket.readyState ===
          WebSocket.CONNECTING
      ) {
        socket.close(
          1011,
          "Deepgram connection failed"
        );
      }

      log.error(
        {
          event:
            "deepgram.connection.failed",

          error:
            normalizeError(
              error
            ),
        },
        "Deepgram connection failed"
      );

      throw error;
    }
  }

  //---------------------------------------
  // Wait Until Open
  //---------------------------------------

  private static waitUntilOpen(
    callId: string,
    socket: WebSocket,
    timeoutMs =
      10_000
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

        if (
          socket.readyState ===
            WebSocket.CLOSED ||
          socket.readyState ===
            WebSocket.CLOSING
        ) {
          reject(
            new Error(
              "Deepgram socket is already closing or closed"
            )
          );

          return;
        }

        const timeout =
          setTimeout(
            () => {
              cleanup();

              reject(
                new Error(
                  `Deepgram connection timed out after ${timeoutMs}ms`
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
                [
                  "Deepgram closed before opening.",
                  `Code: ${code}.`,
                  `Reason length: ${reason.length}.`,
                ].join(
                  " "
                )
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
    const log =
      createCallLogger(
        callId
      );

    //-------------------------------------
    // Validate Audio
    //-------------------------------------

    if (
      !Buffer.isBuffer(
        audio
      ) ||
      audio.length ===
        0
    ) {
      return false;
    }

    //-------------------------------------
    // Locate Session
    //-------------------------------------

    const session =
      sessions.get(
        callId
      );

    if (
      !session
    ) {
      log.warn(
        {
          event:
            "deepgram.audio.rejected",

          reason:
            "session_not_found",

          audioSizeBytes:
            audio.length,
        },
        "Deepgram audio rejected because session was not found"
      );

      return false;
    }

    //-------------------------------------
    // Buffer While Connecting
    //-------------------------------------

    if (
      session.socket
        .readyState ===
      WebSocket.CONNECTING
    ) {
      this.bufferAudio(
        session,
        audio
      );

      if (
        !session.waitingLogWritten
      ) {
        session.waitingLogWritten =
          true;

        log.debug(
          {
            event:
              "deepgram.audio.buffering_started",

            bufferedPackets:
              session
                .pendingAudio
                .length,

            bufferedBytes:
              session
                .pendingAudioBytes,

            maximumBufferBytes:
              MAX_BUFFER_BYTES,
          },
          "Incoming audio buffered while Deepgram connects"
        );
      }

      /*
       * Returning true means the audio packet was
       * accepted by this service, even though it has
       * not yet been transmitted to Deepgram.
       */
      return true;
    }

    //-------------------------------------
    // Reject Closed Socket
    //-------------------------------------

    if (
      session.socket
        .readyState !==
      WebSocket.OPEN
    ) {
      log.warn(
        {
          event:
            "deepgram.audio.rejected",

          reason:
            "socket_unavailable",

          readyState:
            session.socket
              .readyState,

          audioSizeBytes:
            audio.length,
        },
        "Deepgram audio rejected because socket is unavailable"
      );

      return false;
    }

    //-------------------------------------
    // Preserve Ordering
    //-------------------------------------

    /*
     * If earlier packets are waiting, add this packet
     * behind them and flush everything in FIFO order.
     */
    if (
      session.pendingAudio
        .length >
        0 ||
      session.flushingAudio
    ) {
      this.bufferAudio(
        session,
        audio
      );

      this.flushPendingAudio(
        session
      );

      return true;
    }

    //-------------------------------------
    // Send Live Audio
    //-------------------------------------

    try {
      session.socket.send(
        audio
      );

      return true;
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "deepgram.audio.send_failed",

          audioSizeBytes:
            audio.length,

          error:
            normalizeError(
              error
            ),
        },
        "Failed to send audio to Deepgram"
      );

      return false;
    }
  }

  //---------------------------------------
  // Buffer Audio
  //---------------------------------------

  private static bufferAudio(
    session:
      DeepgramSession,
    audio:
      Buffer
  ): void {
    const log =
      createCallLogger(
        session.callId
      );

    /*
     * Copy the buffer because the caller may reuse or
     * mutate its original Buffer after this function.
     */
    const packet =
      Buffer.from(
        audio
      );

    session.pendingAudio.push(
      packet
    );

    session.pendingAudioBytes +=
      packet.length;

    //-------------------------------------
    // Enforce Bounded Memory
    //-------------------------------------

    let droppedBytes =
      0;

    let droppedPackets =
      0;

    /*
     * Remove the oldest packets first. Recent caller
     * audio is more valuable than very old audio if
     * connection establishment takes too long.
     */
    while (
      session.pendingAudioBytes >
        MAX_BUFFER_BYTES &&
      session.pendingAudio.length >
        0
    ) {
      const droppedPacket =
        session.pendingAudio.shift();

      if (
        !droppedPacket
      ) {
        break;
      }

      session.pendingAudioBytes -=
        droppedPacket.length;

      droppedBytes +=
        droppedPacket.length;

      droppedPackets +=
        1;
    }

    if (
      droppedPackets >
      0
    ) {
      log.warn(
        {
          event:
            "deepgram.audio.buffer_limit_reached",

          droppedPackets,

          droppedBytes,

          bufferedPackets:
            session
              .pendingAudio
              .length,

          bufferedBytes:
            session
              .pendingAudioBytes,

          maximumBufferBytes:
            MAX_BUFFER_BYTES,
        },
        "Deepgram audio buffer limit reached; oldest packets dropped"
      );
    }
  }

  //---------------------------------------
  // Flush Pending Audio
  //---------------------------------------

  private static flushPendingAudio(
    session:
      DeepgramSession
  ): void {
    const log =
      createCallLogger(
        session.callId
      );

    if (
      session.flushingAudio
    ) {
      return;
    }

    if (
      session.socket
        .readyState !==
      WebSocket.OPEN
    ) {
      return;
    }

    if (
      session.pendingAudio
        .length ===
      0
    ) {
      session.waitingLogWritten =
        false;

      return;
    }

    session.flushingAudio =
      true;

    const initialPackets =
      session.pendingAudio
        .length;

    const initialBytes =
      session.pendingAudioBytes;

    try {
      while (
        session.pendingAudio
          .length >
        0
      ) {
        if (
          session.socket
            .readyState !==
          WebSocket.OPEN
        ) {
          break;
        }

        const packet =
          session.pendingAudio.shift();

        if (
          !packet
        ) {
          break;
        }

        session.pendingAudioBytes =
          Math.max(
            session.pendingAudioBytes -
              packet.length,
            0
          );

        session.socket.send(
          packet
        );
      }

      log.debug(
        {
          event:
            "deepgram.audio.buffer_flushed",

          flushedPackets:
            initialPackets -
            session
              .pendingAudio
              .length,

          initialPackets,

          initialBytes,

          remainingPackets:
            session
              .pendingAudio
              .length,

          remainingBytes:
            session
              .pendingAudioBytes,
        },
        "Buffered audio flushed to Deepgram"
      );
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "deepgram.audio.buffer_flush_failed",

          initialPackets,

          initialBytes,

          remainingPackets:
            session
              .pendingAudio
              .length,

          remainingBytes:
            session
              .pendingAudioBytes,

          error:
            normalizeError(
              error
            ),
        },
        "Failed to flush buffered Deepgram audio"
      );
    } finally {
      session.flushingAudio =
        false;

      session.waitingLogWritten =
        session.pendingAudio
          .length >
        0;
    }
  }

  //---------------------------------------
  // Clear Pending Audio
  //---------------------------------------

  private static clearPendingAudio(
    session:
      DeepgramSession
  ): void {
    session.pendingAudio.length =
      0;

    session.pendingAudioBytes =
      0;

    session.flushingAudio =
      false;

    session.waitingLogWritten =
      false;
  }

  //---------------------------------------
  // Close
  //---------------------------------------

  static async close(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    const session =
      sessions.get(
        callId
      );

    if (
      !session
    ) {
      return;
    }

    const removedPackets =
      session.pendingAudio
        .length;

    const removedBytes =
      session.pendingAudioBytes;

    sessions.delete(
      callId
    );

    this.clearPendingAudio(
      session
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

    log.info(
      {
        event:
          "deepgram.session.closed",

        previousReadyState:
          session.socket
            .readyState,

        removedPackets,

        removedBytes,
      },
      "Deepgram session closed"
    );
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

  //---------------------------------------
  // Buffered Audio Diagnostics
  //---------------------------------------

  static getBufferedAudioStats(
    callId: string
  ): {
    packets: number;

    bytes: number;
  } {
    const session =
      sessions.get(
        callId
      );

    return {
      packets:
        session?.pendingAudio
          .length ??
        0,

      bytes:
        session?.pendingAudioBytes ??
        0,
    };
  }
}

//--------------------------------------------------
// Environment Integer Helper
//--------------------------------------------------

function getPositiveIntegerEnvironmentValue(
  name: string,
  fallback: number
): number {
  const rawValue =
    process.env[
      name
    ]
      ?.trim();

  if (
    !rawValue
  ) {
    return fallback;
  }

  const parsedValue =
    Number(
      rawValue
    );

  if (
    !Number.isInteger(
      parsedValue
    ) ||
    parsedValue <=
      0
  ) {
    serviceLog.warn(
      {
        event:
          "deepgram.configuration.invalid_integer",

        environmentVariable:
          name,

        configuredValuePresent:
          true,

        fallback,
      },
      "Invalid Deepgram integer configuration; default used"
    );

    return fallback;
  }

  return parsedValue;
}