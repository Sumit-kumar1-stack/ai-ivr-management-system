import {
  Server as HttpServer,
} from "http";

import type {
  Socket as NetSocket,
} from "net";

import {
  WebSocketServer,
  WebSocket,
  RawData,
} from "ws";

import {
  TwilioStreamGateway,
} from "@/providers/telephony/twilio-stream.gateway";


type WebSocketWithInternalSocket =
  WebSocket & {
    _socket?: NetSocket;
  };


export function initializeTwilioWebSocket(
  server: HttpServer
) {
  const twilioWebSocketServer =
    new WebSocketServer({
      noServer: true,
    });


  //------------------------------------
  // Handle Twilio WebSocket Upgrade
  //------------------------------------

  server.on(
    "upgrade",
    (
      request,
      socket,
      head
    ) => {
      try {
        const pathname =
          new URL(
            request.url ?? "/",
            `http://${request.headers.host ?? "localhost"}`
          ).pathname;


        //------------------------------------
        // Ignore non-Twilio upgrade requests
        //------------------------------------

        if (
          pathname !==
          "/api/twilio/stream"
        ) {
          /*
           * Do not destroy this socket.
           *
           * Socket.IO or another WebSocket
           * server may need to handle it.
           */
          return;
        }


        console.log(
          "Twilio WebSocket upgrade requested",
          {
            pathname,

            url:
              request.url,

            host:
              request.headers.host,

            upgrade:
              request.headers.upgrade,

            connection:
              request.headers.connection,

            userAgent:
              request.headers[
                "user-agent"
              ],
          }
        );


        //------------------------------------
        // Upgrade HTTP connection to WebSocket
        //------------------------------------

        twilioWebSocketServer.handleUpgrade(
          request,
          socket,
          head,
          (
            webSocket
          ) => {
            twilioWebSocketServer.emit(
              "connection",
              webSocket,
              request
            );
          }
        );
      } catch (error) {
        console.error(
          "Twilio WebSocket upgrade error:",
          formatError(
            error
          )
        );

        if (
          !socket.destroyed
        ) {
          socket.destroy();
        }
      }
    }
  );


  //------------------------------------
  // Twilio Connected
  //------------------------------------

  twilioWebSocketServer.on(
    "connection",
    (
      webSocket:
        WebSocket
    ) => {
      console.log(
        "🟢 Twilio Media WebSocket connected"
      );


      //----------------------------------
      // Underlying TCP diagnostics
      //----------------------------------

      const tcpSocket =
        (
          webSocket as
            WebSocketWithInternalSocket
        )._socket;

      if (tcpSocket) {
        tcpSocket.on(
          "end",
          () => {
            console.log(
              "⚠️ Twilio TCP socket ended"
            );
          }
        );

        tcpSocket.on(
          "close",
          (
            hadError
          ) => {
            console.log(
              "⚠️ Twilio TCP socket closed",
              {
                hadError,
              }
            );
          }
        );

        tcpSocket.on(
          "error",
          (
            error
          ) => {
            console.error(
              "⚠️ Twilio TCP socket error",
              formatError(
                error
              )
            );
          }
        );
      } else {
        console.warn(
          "Twilio internal TCP socket was unavailable"
        );
      }


      //----------------------------------
      // Incoming Twilio Message
      //----------------------------------

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
              ) as {
                event?: string;

                streamSid?: string;
              };


            console.log(
              "Twilio WebSocket event",
              {
                event:
                  parsed.event,

                streamSid:
                  parsed.streamSid,

                bytes:
                  Buffer.byteLength(
                    rawMessage,
                    "utf8"
                  ),
              }
            );


            //----------------------------------
            // Log important Twilio events
            //----------------------------------

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


            //----------------------------------
            // Forward event to gateway
            //----------------------------------

            await TwilioStreamGateway.handle(
              webSocket,
              rawMessage
            );
          } catch (error) {
            console.error(
              "Twilio WebSocket message error:",
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


      //----------------------------------
      // Twilio WebSocket Ping
      //----------------------------------

      webSocket.on(
        "ping",
        (
          data
        ) => {
          console.log(
            "Twilio WebSocket ping received",
            {
              bytes:
                data.length,
            }
          );
        }
      );


      //----------------------------------
      // Twilio WebSocket Pong
      //----------------------------------

      webSocket.on(
        "pong",
        (
          data
        ) => {
          console.log(
            "Twilio WebSocket pong received",
            {
              bytes:
                data.length,
            }
          );
        }
      );


      //----------------------------------
      // Twilio Disconnected
      //----------------------------------

      webSocket.on(
        "close",
        (
          code,
          reason
        ) => {
          console.log(
            "🔴 Twilio Media WebSocket disconnected",
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


      //----------------------------------
      // Twilio WebSocket Error
      //----------------------------------

      webSocket.on(
        "error",
        (
          error
        ) => {
          console.error(
            "Twilio WebSocket error:",
            formatError(
              error
            )
          );
        }
      );


      //----------------------------------
      // Unexpected response diagnostics
      //----------------------------------

      webSocket.on(
        "unexpected-response",
        (
          request,
          response
        ) => {
          console.error(
            "Unexpected Twilio WebSocket response",
            {
              requestUrl:
                request.path,

              statusCode:
                response.statusCode,

              statusMessage:
                response.statusMessage,
            }
          );
        }
      );
    }
  );


  //------------------------------------
  // WebSocket Server Error
  //------------------------------------

  twilioWebSocketServer.on(
    "error",
    (
      error
    ) => {
      console.error(
        "Twilio WebSocket server error:",
        formatError(
          error
        )
      );
    }
  );


  console.log(
    "🎙️ Twilio WebSocket initialized at /api/twilio/stream"
  );


  return twilioWebSocketServer;
}


//------------------------------------
// Convert WebSocket RawData to String
//------------------------------------

function rawDataToString(
  data: RawData
): string {
  if (
    typeof data ===
    "string"
  ) {
    return data;
  }


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


//------------------------------------
// Format Unknown Errors
//------------------------------------

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
          string | number;
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