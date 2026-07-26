import http from "node:http";

import "dotenv/config";

import {
  WebSocketServer,
} from "ws";

import {
  TwilioStreamGateway,
} from "@/providers/telephony/twilio-stream.gateway";

import {
  TranscriptSubscriber,
} from "@/services/speech/transcript.subscriber";

const MEDIA_PORT =
  Number(
    process.env
      .TWILIO_MEDIA_PORT ??
    3001
  );


const server =
  http.createServer(
    (
      request,
      response
    ) => {

      const url =
        new URL(
          request.url ?? "/",
          `http://${request.headers.host ?? "localhost"}`
        );


      if (
        request.method === "GET" &&
        url.pathname === "/health"
      ) {

        response.writeHead(
          200,
          {
            "Content-Type":
              "application/json",
          }
        );

        response.end(
          JSON.stringify({
            success:
              true,

            service:
              "twilio-media-server",
          })
        );

        return;

      }


      response.writeHead(
        404,
        {
          "Content-Type":
            "text/plain",
        }
      );

      response.end(
        "Not found"
      );

    }
  );


const webSocketServer =
  new WebSocketServer({
    noServer:
      true,

    perMessageDeflate:
      false,

    clientTracking:
      true,
  });


server.on(
  "upgrade",
  (
    request,
    socket,
    head
  ) => {

    try {

      const url =
        new URL(
          request.url ?? "/",
          "http://localhost"
        );


      if (
        url.pathname !==
        "/api/twilio/stream"
      ) {

        socket.destroy();

        return;

      }


      console.log(
        "Twilio media upgrade received",
        {
          pathname:
            url.pathname,

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


      webSocketServer.handleUpgrade(
        request,
        socket,
        head,
        webSocket => {

          webSocketServer.emit(
            "connection",
            webSocket,
            request
          );

        }
      );

    } catch (error) {

      console.error(
        "Twilio media upgrade failed",
        error
      );

      socket.destroy();

    }

  }
);


webSocketServer.on(
  "connection",
  (
    webSocket,
    request
  ) => {

    console.log(
      "Twilio media connection established",
      {
        url:
          request.url,

        readyState:
          webSocket.readyState,
      }
    );


    webSocket.on(
      "message",
      async data => {

        const rawMessage =
          data.toString();


        try {

          const message =
            JSON.parse(
              rawMessage
            ) as {
              event?: string;
              streamSid?: string;

              start?: {
                streamSid?: string;
              };
            };


          if (
            message.event !==
            "media"
          ) {

            console.log(
              "Twilio media event",
              {
                event:
                  message.event,

                streamSid:
                  message.streamSid ??
                  message.start
                    ?.streamSid,
              }
            );

          }


          await TwilioStreamGateway
            .handle(
              webSocket,
              rawMessage
            );

        } catch (error) {

          console.error(
            "Twilio media message failed",
            {
              error:
                error instanceof Error
                  ? error.message
                  : String(
                      error
                    ),

              rawMessage:
                rawMessage.slice(
                  0,
                  500
                ),
            }
          );

        }

      }
    );


    webSocket.on(
      "close",
      (
        code,
        reason
      ) => {

        console.log(
          "Twilio media connection closed",
          {
            code,

            reason:
              reason.toString(),
          }
        );

      }
    );


    webSocket.on(
      "error",
      error => {

        console.error(
          "Twilio media WebSocket error",
          error
        );

      }
    );

  }
);


webSocketServer.on(
  "error",
  error => {

    console.error(
      "Twilio media server error",
      error
    );

  }
);


//------------------------------------
// Start Media Server
//------------------------------------

function startMediaServer(): void {

  // Register transcript listener
  // before accepting Twilio calls.
  TranscriptSubscriber.register();

  server.listen(
    MEDIA_PORT,
    () => {

      console.log(
        `Twilio media server listening on http://localhost:${MEDIA_PORT}`
      );

    }
  );

}

startMediaServer();