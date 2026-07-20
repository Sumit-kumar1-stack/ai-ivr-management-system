import http from "http";
import next from "next";

import {
  initializeTwilioWebSocket,
} from "./twilio-websocket";

import {
  initializeSocket,
} from "./socket";

const development =
  process.env.NODE_ENV !==
  "production";

const PORT =
  Number(
    process.env.PORT ?? 3000
  );

async function startServer() {

  const app =
    next({
      dev: development,
    });

  const handle =
    app.getRequestHandler();

  await app.prepare();

  const server =
    http.createServer(
      (
        request,
        response
      ) => {

        handle(
          request,
          response
        ).catch(
          (
            error
          ) => {

            console.error(
              "Next request handling error:",
              error
            );

            if (
              !response.headersSent
            ) {

              response.statusCode =
                500;

              response.end(
                "Internal Server Error"
              );

            }

          }
        );

      }
    );

  //------------------------------------
  // Register Twilio WebSocket FIRST
  //------------------------------------

  initializeTwilioWebSocket(
    server
  );

  //------------------------------------
  // Register Socket.IO SECOND
  //------------------------------------

  initializeSocket(
    server
  );

  //------------------------------------
  // Diagnostics
  //------------------------------------

  console.log(
    "Upgrade listener count:",
    server.listenerCount(
      "upgrade"
    )
  );

  server.listeners(
    "upgrade"
  ).forEach(
    (
      listener,
      index
    ) => {

      console.log(
        `Upgrade listener #${index + 1}:`,
        listener.name ||
        "anonymous"
      );

    }
  );

  //------------------------------------
  // Start HTTP Server
  //------------------------------------

  server.listen(
    PORT,
    () => {

      console.log(
        `🚀 Server listening on http://localhost:${PORT}`
      );

    }
  );

}

startServer().catch(
  (
    error
  ) => {

    console.error(
      "Server startup failed:",
      error
    );

    process.exit(1);

  }
);