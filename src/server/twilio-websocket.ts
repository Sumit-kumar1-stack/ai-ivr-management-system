import {
  IncomingMessage,
  Server as HttpServer,
} from "http";

import type {
  Socket as NetSocket,
} from "net";

import type {
  Duplex,
} from "stream";

import {
  RawData,
  WebSocket,
  WebSocketServer,
} from "ws";

import twilio from "twilio";

import {
  createCallLogger,
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import {
  TwilioStreamGateway,
} from "@/providers/telephony/twilio-stream.gateway";

import {
  ConversationAbort,
} from "@/services/conversations/abort.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  SilenceDetector,
} from "@/services/conversations/silence-detector.service";

import {
  STTProviderFactory,
} from "@/services/stt/providers/provider.factory";

import {
  GeminiLiveMediaService,
} from "@/services/voice/gemini-live-media.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

//--------------------------------------------------
// Types
//--------------------------------------------------

type WebSocketWithInternalSocket =
  WebSocket & {
    _socket?: NetSocket;
  };

type TwilioMessage = {
  event?: string;

  streamSid?: string;

  sequenceNumber?: string;

  start?: {
    streamSid?: string;

    callSid?: string;

    customParameters?: Record<
      string,
      string
    >;
  };
};

interface TwilioSocketContext {
  callId?: string;

  streamSid?: string;

  twilioCallSid?: string;

  stopEventReceived: boolean;

  cleanupPromise?: Promise<void>;
}

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "twilio-websocket"
  );

//--------------------------------------------------
// Initialized Server Registry
//--------------------------------------------------

const initializedServers =
  new WeakMap<
    HttpServer,
    WebSocketServer
  >();

//--------------------------------------------------
// Per-Socket Context
//--------------------------------------------------

const socketContexts =
  new WeakMap<
    WebSocket,
    TwilioSocketContext
  >();

//--------------------------------------------------
// Initialize Twilio WebSocket Server
//--------------------------------------------------

export function initializeTwilioWebSocket(
  server: HttpServer
): WebSocketServer {
  const existingServer =
    initializedServers.get(
      server
    );

  if (
    existingServer
  ) {
    log.debug(
      {
        event:
          "twilio.websocket.initialize_skipped",

        reason:
          "already_initialized",
      },
      "Twilio WebSocket is already initialized"
    );

    return existingServer;
  }

  /*
   * noServer mode allows the application to accept
   * only the Twilio Media Stream endpoint.
   */
  const twilioWebSocketServer =
    new WebSocketServer({
      noServer:
        true,

      perMessageDeflate:
        false,

      clientTracking:
        true,
    });

  initializedServers.set(
    server,
    twilioWebSocketServer
  );

  //------------------------------------------------
  // Handle Twilio HTTP Upgrade
  //------------------------------------------------

  const upgradeHandler =
    (
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer
    ): void => {
      try {
        const incomingUrl =
          new URL(
            request.url ??
              "/",
            "http://localhost"
          );

        const pathname =
          incomingUrl.pathname;

        /*
         * Ignore all non-Twilio upgrade requests.
         */
        if (
          pathname !==
          "/api/twilio/stream"
        ) {
          return;
        }

        log.debug(
          {
            event:
              "twilio.websocket.upgrade_requested",

            pathname,

            method:
              request.method,

            signaturePresent:
              Boolean(
                request.headers[
                  "x-twilio-signature"
                ]
              ),

            websocketKeyPresent:
              Boolean(
                request.headers[
                  "sec-websocket-key"
                ]
              ),
          },
          "Twilio WebSocket upgrade requested"
        );

        //------------------------------------------
        // Validate WebSocket Upgrade Header
        //------------------------------------------

        if (
          request.headers.upgrade
            ?.toLowerCase() !==
          "websocket"
        ) {
          log.warn(
            {
              event:
                "twilio.websocket.upgrade_rejected",

              pathname,

              reason:
                "invalid_upgrade_header",
            },
            "Twilio WebSocket upgrade rejected"
          );

          rejectUpgrade(
            socket,
            400,
            "WebSocket upgrade required"
          );

          return;
        }

        //------------------------------------------
        // Validate Twilio Signature
        //------------------------------------------

        const validSignature =
          validateTwilioWebSocketSignature(
            request
          );

        if (
          !validSignature
        ) {
          log.warn(
            {
              event:
                "twilio.websocket.signature_rejected",

              pathname,
            },
            "Twilio WebSocket signature rejected"
          );

          rejectUpgrade(
            socket,
            403,
            "Forbidden"
          );

          return;
        }

        log.info(
          {
            event:
              "twilio.websocket.signature_validated",

            pathname,
          },
          "Twilio WebSocket signature validated"
        );

        //------------------------------------------
        // Complete WebSocket Upgrade
        //------------------------------------------

        twilioWebSocketServer.handleUpgrade(
          request,
          socket,
          head,
          webSocket => {
            twilioWebSocketServer.emit(
              "connection",
              webSocket,
              request
            );
          }
        );
      } catch (
        error
      ) {
        log.error(
          {
            event:
              "twilio.websocket.upgrade_failed",

            error:
              normalizeError(
                error
              ),
          },
          "Twilio WebSocket upgrade failed"
        );

        if (
          !socket.destroyed
        ) {
          rejectUpgrade(
            socket,
            500,
            "Internal Server Error"
          );
        }
      }
    };

  server.on(
    "upgrade",
    upgradeHandler
  );

  //------------------------------------------------
  // Twilio WebSocket Connected
  //------------------------------------------------

  twilioWebSocketServer.on(
    "connection",
    (
      webSocket:
        WebSocket,
      _request:
        IncomingMessage
    ) => {
      socketContexts.set(
        webSocket,
        {
          stopEventReceived:
            false,
        }
      );

      log.info(
        {
          event:
            "twilio.websocket.connected",

          readyState:
            webSocket.readyState,

          protocolPresent:
            Boolean(
              webSocket.protocol
            ),

          extensionsPresent:
            Boolean(
              webSocket.extensions
            ),

          connectedClients:
            twilioWebSocketServer
              .clients
              .size,
        },
        "Twilio media WebSocket connected"
      );

      //------------------------------------------------
      // Serialize Messages Per Socket
      //------------------------------------------------

      let messageChain:
        Promise<void> =
        Promise.resolve();

      //------------------------------------------------
      // Underlying TCP Diagnostics
      //------------------------------------------------

      const tcpSocket =
        (
          webSocket as
            WebSocketWithInternalSocket
        )._socket;

      if (
        tcpSocket
      ) {
        tcpSocket.on(
          "end",
          () => {
            log.debug(
              {
                event:
                  "twilio.websocket.tcp_ended",
              },
              "Twilio TCP socket ended"
            );
          }
        );

        tcpSocket.on(
          "close",
          hadError => {
            log.debug(
              {
                event:
                  "twilio.websocket.tcp_closed",

                hadError,
              },
              "Twilio TCP socket closed"
            );
          }
        );

        tcpSocket.on(
          "error",
          error => {
            log.error(
              {
                event:
                  "twilio.websocket.tcp_error",

                error:
                  normalizeError(
                    error
                  ),
              },
              "Twilio TCP socket error"
            );

            void cleanupSocketResources(
              webSocket,
              "tcp_error"
            );
          }
        );
      }

      //------------------------------------------------
      // Receive Twilio Messages
      //------------------------------------------------

      webSocket.on(
        "message",
        (
          data:
            RawData
        ) => {
          const rawMessage =
            rawDataToString(
              data
            );

          /*
           * Twilio messages are ordered. Chaining each
           * operation prevents a media frame from being
           * handled before the asynchronous start event
           * has completed STT initialization.
           */
          messageChain =
            messageChain
              .then(
                async () => {
                  let parsed:
                    TwilioMessage;

                  try {
                    parsed =
                      JSON.parse(
                        rawMessage
                      ) as TwilioMessage;
                  } catch (
                    error
                  ) {
                    log.warn(
                      {
                        event:
                          "twilio.websocket.message_rejected",

                        reason:
                          "invalid_json",

                        messageSizeBytes:
                          Buffer.byteLength(
                            rawMessage,
                            "utf8"
                          ),

                        error:
                          normalizeError(
                            error
                          ),
                      },
                      "Invalid Twilio WebSocket message"
                    );

                    return;
                  }

                  captureSocketContext(
                    webSocket,
                    parsed
                  );

                  /*
                   * Never log media payloads or raw Twilio
                   * messages.
                   */
                  if (
                    parsed.event !==
                    "media"
                  ) {
                    log.debug(
                      {
                        event:
                          "twilio.websocket.event_received",

                        twilioEvent:
                          parsed.event ??
                          "unknown",

                        sequenceNumberPresent:
                          Boolean(
                            parsed.sequenceNumber
                          ),

                        streamSidPresent:
                          Boolean(
                            parsed.streamSid ||
                            parsed.start
                              ?.streamSid
                          ),

                        messageSizeBytes:
                          Buffer.byteLength(
                            rawMessage,
                            "utf8"
                          ),
                      },
                      "Twilio WebSocket lifecycle event received"
                    );
                  }

                  await TwilioStreamGateway.handle(
                    webSocket,
                    rawMessage
                  );

                  /*
                   * The gateway performs normal stop-event
                   * cleanup. This final pass releases memory
                   * that must not remain after a completed
                   * stream.
                   */
                  if (
                    parsed.event ===
                    "stop"
                  ) {
                    await cleanupSocketResources(
                      webSocket,
                      "twilio_stop"
                    );
                  }
                }
              )
              .catch(
                error => {
                  log.error(
                    {
                      event:
                        "twilio.websocket.message_failed",

                      messageSizeBytes:
                        Buffer.byteLength(
                          rawMessage,
                          "utf8"
                        ),

                      error:
                        normalizeError(
                          error
                        ),
                    },
                    "Twilio WebSocket message processing failed"
                  );
                }
              );
        }
      );

      //------------------------------------------------
      // WebSocket Closed
      //------------------------------------------------

      webSocket.on(
        "close",
        (
          code,
          reason
        ) => {
          log.info(
            {
              event:
                "twilio.websocket.disconnected",

              code,

              reasonLength:
                reason.length,

              readyState:
                webSocket.readyState,

              connectedClients:
                twilioWebSocketServer
                  .clients
                  .size,
            },
            "Twilio media WebSocket disconnected"
          );

          void cleanupSocketResources(
            webSocket,
            "socket_close"
          );
        }
      );

      //------------------------------------------------
      // WebSocket Error
      //------------------------------------------------

      webSocket.on(
        "error",
        error => {
          log.error(
            {
              event:
                "twilio.websocket.client_error",

              error:
                normalizeError(
                  error
                ),
            },
            "Twilio WebSocket client error"
          );

          void cleanupSocketResources(
            webSocket,
            "socket_error"
          );
        }
      );

      //------------------------------------------------
      // Ping Diagnostics
      //------------------------------------------------

      webSocket.on(
        "ping",
        data => {
          log.debug(
            {
              event:
                "twilio.websocket.ping_received",

              sizeBytes:
                data.length,
            },
            "Twilio WebSocket ping received"
          );
        }
      );

      //------------------------------------------------
      // Pong Diagnostics
      //------------------------------------------------

      webSocket.on(
        "pong",
        data => {
          log.debug(
            {
              event:
                "twilio.websocket.pong_received",

              sizeBytes:
                data.length,
            },
            "Twilio WebSocket pong received"
          );
        }
      );
    }
  );

  //------------------------------------------------
  // WebSocket Server Error
  //------------------------------------------------

  twilioWebSocketServer.on(
    "error",
    error => {
      log.error(
        {
          event:
            "twilio.websocket.server_error",

          error:
            normalizeError(
              error
            ),
        },
        "Twilio WebSocket server error"
      );
    }
  );

  //------------------------------------------------
  // HTTP Server Closed
  //------------------------------------------------

  server.once(
    "close",
    () => {
      initializedServers.delete(
        server
      );

      server.off(
        "upgrade",
        upgradeHandler
      );

      twilioWebSocketServer.close(
        error => {
          if (
            error
          ) {
            log.error(
              {
                event:
                  "twilio.websocket.shutdown_failed",

                error:
                  normalizeError(
                    error
                  ),
              },
              "Twilio WebSocket shutdown failed"
            );

            return;
          }

          log.info(
            {
              event:
                "twilio.websocket.shutdown_completed",
            },
            "Twilio WebSocket server closed"
          );
        }
      );
    }
  );

  log.info(
    {
      event:
        "twilio.websocket.initialized",

      path:
        "/api/twilio/stream",

      signatureValidation:
        true,

      signatureOriginSource:
        "TWILIO_MEDIA_PUBLIC_URL",

      messageSerialization:
        true,

      abnormalCloseCleanup:
        true,

      perMessageDeflate:
        false,
    },
    "Twilio WebSocket initialized"
  );

  return twilioWebSocketServer;
}

//--------------------------------------------------
// Capture Per-Socket Twilio Identifiers
//--------------------------------------------------

function captureSocketContext(
  webSocket: WebSocket,
  message: TwilioMessage
): void {
  const context =
    socketContexts.get(
      webSocket
    ) ?? {
      stopEventReceived:
        false,
    };

  if (
    message.event ===
    "start"
  ) {
    const internalCallId =
      message.start
        ?.customParameters
        ?.callId
        ?.trim();

    const customTwilioCallSid =
      message.start
        ?.customParameters
        ?.twilioCallSid
        ?.trim();

    const startTwilioCallSid =
      message.start
        ?.callSid
        ?.trim();

    const streamSid =
      (
        message.start
          ?.streamSid ||
        message.streamSid
      )
        ?.trim();

    context.callId =
      internalCallId ||
      context.callId;

    context.twilioCallSid =
      startTwilioCallSid ||
      customTwilioCallSid ||
      context.twilioCallSid;

    context.streamSid =
      streamSid ||
      context.streamSid;
  }

  if (
    message.event ===
    "stop"
  ) {
    context.stopEventReceived =
      true;

    context.streamSid =
      message.streamSid
        ?.trim() ||
      context.streamSid;
  }

  socketContexts.set(
    webSocket,
    context
  );
}

//--------------------------------------------------
// Cleanup Socket-Owned Resources
//--------------------------------------------------

function cleanupSocketResources(
  webSocket: WebSocket,
  reason:
    | "twilio_stop"
    | "socket_close"
    | "socket_error"
    | "tcp_error"
): Promise<void> {
  const context =
    socketContexts.get(
      webSocket
    ) ?? {
      stopEventReceived:
        false,
    };

  if (
    context.cleanupPromise
  ) {
    return context.cleanupPromise;
  }

  context.cleanupPromise =
    cleanupSocketResourcesInternal(
      context,
      reason
    ).finally(
      () => {
        socketContexts.delete(
          webSocket
        );
      }
    );

  socketContexts.set(
    webSocket,
    context
  );

  return context.cleanupPromise;
}

//--------------------------------------------------
// Internal Resource Cleanup
//--------------------------------------------------

async function cleanupSocketResourcesInternal(
  context:
    TwilioSocketContext,
  reason:
    | "twilio_stop"
    | "socket_close"
    | "socket_error"
    | "tcp_error"
): Promise<void> {
  const session =
    context.streamSid
      ? AudioSessionService.get(
          context.streamSid
        )
      : undefined;

  const callId =
    context.callId ||
    session?.callId;

  const streamSid =
    context.streamSid ||
    session?.streamSid;

  const cleanupLog =
    callId
      ? createCallLogger(
          callId
        )
      : log;

  if (
    !callId &&
    !streamSid
  ) {
    cleanupLog.debug(
      {
        event:
          "twilio.websocket.cleanup_skipped",

        reason:
          "socket_context_unavailable",

        trigger:
          reason,
      },
      "Twilio WebSocket cleanup skipped"
    );

    return;
  }

  cleanupLog.info(
    {
      event:
        "twilio.websocket.cleanup_started",

      trigger:
        reason,

      callIdPresent:
        Boolean(
          callId
        ),

      streamSidPresent:
        Boolean(
          streamSid
        ),

      stopEventReceived:
        context.stopEventReceived,

      activeSessionPresent:
        Boolean(
          session
        ),
    },
    "Twilio WebSocket resource cleanup started"
  );

  //----------------------------------------------
  // End Conversation Work First
  //----------------------------------------------

  if (
    callId
  ) {
    const currentState =
      ConversationStateService.getState(
        callId
      );

    if (
      currentState !==
      "ENDED"
    ) {
      ConversationStateService.setState(
        callId,
        "ENDED"
      );
    }

    SilenceDetector.stop(
      callId
    );

    ConversationAbort.abort(
      callId
    );
  }

//----------------------------------------------
// Disconnect Voice Runtime For Abnormal
// Termination
//----------------------------------------------

if (
  callId &&
  session
) {
  if (
    session.voiceRuntime ===
    "GEMINI_LIVE"
  ) {
    GeminiLiveMediaService.close(
      callId
    );
  } else {
    try {
      await STTProviderFactory
        .get()
        .disconnect(
          callId
        );
    } catch (
      error
    ) {
      cleanupLog.error(
        {
          event:
            "twilio.websocket.cleanup_stt_failed",

          trigger:
            reason,

          error:
            normalizeError(
              error
            ),
        },
        "Failed to disconnect STT during WebSocket cleanup"
      );
    }
  }
}

  //----------------------------------------------
  // Close Telephony Session
  //----------------------------------------------

  if (
    streamSid &&
    AudioSessionService.get(
      streamSid
    )
  ) {
    /*
     * Closing the session invokes the registered
     * transcript cleanup listener and stops the
     * voice worker.
     */
    AudioSessionService.close(
      streamSid
    );
  } else if (
    callId
  ) {
    /*
     * The normal Twilio stop event may already have
     * removed the session. Ensure the voice worker is
     * still stopped before releasing memory.
     */
    VoiceWorker.stop(
      callId
    );
  }

  //----------------------------------------------
  // Release Remaining In-Memory State
  //----------------------------------------------

  if (
    callId
  ) {
    ConversationAbort.clear(
      callId
    );

    ConversationStateService.clearState(
      callId
    );
  }

  cleanupLog.info(
    {
      event:
        "twilio.websocket.cleanup_completed",

      trigger:
        reason,

      stopEventReceived:
        context.stopEventReceived,
    },
    "Twilio WebSocket resource cleanup completed"
  );
}

//--------------------------------------------------
// Validate Twilio WebSocket Signature
//--------------------------------------------------

function validateTwilioWebSocketSignature(
  request: IncomingMessage
): boolean {
  const signatureHeader =
    request.headers[
      "x-twilio-signature"
    ];

  const signature =
    Array.isArray(
      signatureHeader
    )
      ? signatureHeader[0]
      : signatureHeader;

  if (
    !signature?.trim()
  ) {
    log.warn(
      {
        event:
          "twilio.websocket.signature_missing",
      },
      "Twilio WebSocket upgrade is missing signature"
    );

    return false;
  }

  const authToken =
    process.env
      .TWILIO_AUTH_TOKEN
      ?.trim();

  if (
    !authToken
  ) {
    throw new Error(
      "TWILIO_AUTH_TOKEN is not configured"
    );
  }

  const publicWebSocketOrigin =
    getTrustedPublicWebSocketOrigin();

  const incomingUrl =
    new URL(
      request.url ??
        "/api/twilio/stream",
      "http://localhost"
    );

  /*
   * Twilio signs the exact WSS URL supplied in the
   * TwiML <Stream> element.
   */
  const validationUrl =
    `${publicWebSocketOrigin}` +
    `${incomingUrl.pathname}` +
    `${incomingUrl.search}`;

  const valid =
    twilio.validateRequest(
      authToken,
      signature,
      validationUrl,
      {}
    );

  log.debug(
    {
      event:
        "twilio.websocket.signature_validation_completed",

      signaturePresent:
        true,

      valid,
    },
    "Twilio WebSocket signature validation completed"
  );

  return valid;
}

//--------------------------------------------------
// Resolve Trusted Media WebSocket Origin
//--------------------------------------------------

function getTrustedPublicWebSocketOrigin():
  string {
  const configuredUrl =
    process.env
      .TWILIO_MEDIA_PUBLIC_URL
      ?.trim()
      .replace(
        /\/+$/,
        ""
      );

  if (
    !configuredUrl
  ) {
    throw new Error(
      "TWILIO_MEDIA_PUBLIC_URL is not configured"
    );
  }

  const url =
    new URL(
      configuredUrl
    );

  if (
    url.protocol ===
    "https:"
  ) {
    url.protocol =
      "wss:";
  } else if (
    url.protocol ===
    "http:"
  ) {
    url.protocol =
      "ws:";
  } else if (
    url.protocol !==
      "wss:" &&
    url.protocol !==
      "ws:"
  ) {
    throw new Error(
      `Unsupported Twilio media URL protocol: ${url.protocol}`
    );
  }

  return url.origin;
}

//--------------------------------------------------
// Reject Upgrade Request
//--------------------------------------------------

function rejectUpgrade(
  socket: Duplex,
  statusCode: number,
  message: string
): void {
  if (
    socket.destroyed
  ) {
    return;
  }

  const body =
    message;

  socket.write(
    `HTTP/1.1 ${statusCode} ${getHttpStatusText(
      statusCode
    )}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `Content-Length: ${Buffer.byteLength(
      body,
      "utf8"
    )}\r\n` +
    `Connection: close\r\n` +
    `Cache-Control: no-store\r\n` +
    `\r\n` +
    body
  );

  socket.destroy();
}

//--------------------------------------------------
// HTTP Status Text
//--------------------------------------------------

function getHttpStatusText(
  statusCode: number
): string {
  switch (
    statusCode
  ) {
    case 400:
      return "Bad Request";

    case 403:
      return "Forbidden";

    case 500:
      return "Internal Server Error";

    default:
      return "Error";
  }
}

//--------------------------------------------------
// Convert Raw WebSocket Data
//--------------------------------------------------

function rawDataToString(
  data: RawData
): string {
  if (
    Buffer.isBuffer(
      data
    )
  ) {
    return data.toString(
      "utf8"
    );
  }

  if (
    data instanceof
    ArrayBuffer
  ) {
    return Buffer
      .from(
        data
      )
      .toString(
        "utf8"
      );
  }

  if (
    Array.isArray(
      data
    )
  ) {
    return Buffer
      .concat(
        data
      )
      .toString(
        "utf8"
      );
  }

  return String(
    data
  );
}