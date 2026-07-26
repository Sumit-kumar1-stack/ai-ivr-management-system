import {
  IncomingMessage,
  Server as HttpServer,
} from "http";

import type {
  Duplex,
} from "stream";

import type {
  Socket as NetSocket,
} from "net";

import {
  RawData,
  WebSocket,
  WebSocketServer,
} from "ws";

import twilio from "twilio";

import {
  TwilioStreamGateway,
} from "@/providers/telephony/twilio-stream.gateway";


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


/*
 * Prevent duplicate WebSocket initialization.
 *
 * This is important in development because custom
 * servers and hot reloads can initialize modules
 * more than once.
 */
const initializedServers =
  new WeakMap<
    HttpServer,
    WebSocketServer
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

    console.log(
      "Twilio WebSocket already initialized"
    );

    return existingServer;

  }


  /*
   * noServer mode allows us to manually accept
   * only the Twilio endpoint.
   *
   * Socket.IO must use polling-only mode so it
   * does not register a competing upgrade handler.
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
            request.url ?? "/",
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


        console.log(
          "Twilio WebSocket upgrade requested",
          {
            pathname,

            url:
              request.url,

            method:
              request.method,

            host:
              request.headers.host,

            forwardedHost:
              request.headers[
                "x-forwarded-host"
              ],

            forwardedProto:
              request.headers[
                "x-forwarded-proto"
              ],

            upgrade:
              request.headers.upgrade,

            connection:
              request.headers.connection,

            websocketVersion:
              request.headers[
                "sec-websocket-version"
              ],

            websocketProtocol:
              request.headers[
                "sec-websocket-protocol"
              ],

            websocketExtensions:
              request.headers[
                "sec-websocket-extensions"
              ],

            websocketKeyPresent:
              Boolean(
                request.headers[
                  "sec-websocket-key"
                ]
              ),

            userAgent:
              request.headers[
                "user-agent"
              ],

            signaturePresent:
              Boolean(
                request.headers[
                  "x-twilio-signature"
                ]
              ),
          }
        );


        //------------------------------------------
        // Validate WebSocket Upgrade Header
        //------------------------------------------

        if (
          request.headers.upgrade
            ?.toLowerCase() !==
          "websocket"
        ) {

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

          console.warn(
            "Twilio WebSocket signature rejected",
            {
              pathname,

              url:
                request.url,

              host:
                request.headers.host,

              forwardedHost:
                request.headers[
                  "x-forwarded-host"
                ],

              forwardedProto:
                request.headers[
                  "x-forwarded-proto"
                ],

              remoteAddress:
                request.socket
                  .remoteAddress,
            }
          );


          rejectUpgrade(
            socket,
            403,
            "Forbidden"
          );

          return;

        }


        console.log(
          "Twilio WebSocket signature validated",
          {
            pathname,
          }
        );


        //------------------------------------------
        // Complete WebSocket Upgrade
        //------------------------------------------

        twilioWebSocketServer
          .handleUpgrade(
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

      } catch (error) {

        console.error(
          "Twilio WebSocket upgrade error",
          formatError(
            error
          )
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

      request:
        IncomingMessage
    ) => {

      console.log(
        "Twilio Media WebSocket connected",
        {
          url:
            request.url,

          remoteAddress:
            request.socket
              .remoteAddress,

          readyState:
            webSocket.readyState,

          protocol:
            webSocket.protocol ||
            "(none)",

          extensions:
            webSocket.extensions ||
            "(none)",
        }
      );


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

            console.log(
              "Twilio TCP socket ended"
            );

          }
        );


        tcpSocket.on(
          "close",
          hadError => {

            console.log(
              "Twilio TCP socket closed",
              {
                hadError,
              }
            );

          }
        );


        tcpSocket.on(
          "error",
          error => {

            console.error(
              "Twilio TCP socket error",
              formatError(
                error
              )
            );

          }
        );

      }


      //------------------------------------------------
      // Receive Twilio Messages
      //------------------------------------------------

      webSocket.on(
        "message",
        async (
          data:
            RawData
        ) => {

          const rawMessage =
            rawDataToString(
              data
            );


          try {

            const parsed =
              JSON.parse(
                rawMessage
              ) as TwilioMessage;


            /*
             * Do not log media packets because Twilio
             * sends many audio frames each second.
             */
            if (
              parsed.event !==
              "media"
            ) {

              console.log(
                "Twilio WebSocket event",
                {
                  event:
                    parsed.event,

                  streamSid:
                    parsed.streamSid ??
                    parsed.start
                      ?.streamSid,

                  sequenceNumber:
                    parsed.sequenceNumber,

                  bytes:
                    Buffer.byteLength(
                      rawMessage,
                      "utf8"
                    ),
                }
              );

            }


            //----------------------------------------
            // Lifecycle Diagnostics
            //----------------------------------------

            if (
              parsed.event ===
                "connected" ||
              parsed.event ===
                "start" ||
              parsed.event ===
                "stop"
            ) {

              console.log(
                "========== TWILIO WS RAW =========="
              );

              console.log(
                rawMessage
              );

              console.log(
                "=================================="
              );

            }


            //----------------------------------------
            // Forward To Application Gateway
            //----------------------------------------

            await TwilioStreamGateway
              .handle(
                webSocket,
                rawMessage
              );

          } catch (error) {

            console.error(
              "Twilio WebSocket message error",
              {
                error:
                  formatError(
                    error
                  ),

                rawMessage:
                  rawMessage.slice(
                    0,
                    1000
                  ),
              }
            );

          }

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

          console.log(
            "Twilio Media WebSocket disconnected",
            {
              code,

              reason:
                reason.toString(),

              readyState:
                webSocket.readyState,
            }
          );

        }
      );


      //------------------------------------------------
      // WebSocket Error
      //------------------------------------------------

      webSocket.on(
        "error",
        error => {

          console.error(
            "Twilio WebSocket error",
            formatError(
              error
            )
          );

        }
      );


      //------------------------------------------------
      // Ping Diagnostics
      //------------------------------------------------

      webSocket.on(
        "ping",
        data => {

          console.debug(
            "Twilio WebSocket ping received",
            {
              bytes:
                data.length,
            }
          );

        }
      );


      //------------------------------------------------
      // Pong Diagnostics
      //------------------------------------------------

      webSocket.on(
        "pong",
        data => {

          console.debug(
            "Twilio WebSocket pong received",
            {
              bytes:
                data.length,
            }
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

      console.error(
        "Twilio WebSocket server error",
        formatError(
          error
        )
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


      twilioWebSocketServer.close(
        error => {

          if (
            error
          ) {

            console.error(
              "Twilio WebSocket shutdown error",
              formatError(
                error
              )
            );

          }

        }
      );

    }
  );


  console.log(
    "Twilio WebSocket initialized at /api/twilio/stream"
  );


  return twilioWebSocketServer;

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

    console.warn(
      "Twilio WebSocket upgrade missing X-Twilio-Signature"
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
   * Twilio signs the exact WSS URL supplied
   * inside the TwiML <Stream> element.
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


  console.log(
    "Twilio WebSocket signature validation",
    {
      validationUrl,

      signaturePresent:
        true,

      valid,
    }
  );


  return valid;

}


//--------------------------------------------------
// Resolve Public WebSocket Origin
//--------------------------------------------------

function getTrustedPublicWebSocketOrigin():
  string {

 const configuredUrl =
  (
    process.env
      .TWILIO_PUBLIC_BASE_URL
      ?.trim() ||
    process.env
      .APP_URL
      ?.trim()
  )
    ?.replace(
      /\/+$/,
      ""
    );


  if (
    !configuredUrl
  ) {

    throw new Error(
      "TWILIO_PUBLIC_BASE_URL or APP_URL is not configured"
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
      `Unsupported Twilio public URL protocol: ${url.protocol}`
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


//--------------------------------------------------
// Format Unknown Error
//--------------------------------------------------

function formatError(
  error: unknown
): {
  name?: string;
  message: string;
  code?: string | number;
  stack?: string;
} {

  if (
    error instanceof
    Error
  ) {

    const errorWithCode =
      error as Error & {
        code?:
          string |
          number;
      };


    return {
      name:
        error.name,

      message:
        error.message,

      code:
        errorWithCode.code,

      stack:
        error.stack,
    };

  }


  return {
    message:
      String(
        error
      ),
  };

}