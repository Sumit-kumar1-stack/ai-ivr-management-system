import http from "http";
import next from "next";

import {
  initializeSocket,
} from "./socket";


const development =
  process.env.NODE_ENV !==
  "production";


const PORT =
  Number(
    process.env.PORT ??
    3000
  );


async function startServer():
  Promise<void> {

  const app =
    next({
      dev:
        development,
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
          error => {

            console.error(
              "Next request handling error",
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
  // Dashboard Socket.IO
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


  server.listen(
    PORT,
    () => {

      console.log(
        `Server listening on http://localhost:${PORT}`
      );

    }
  );

}


startServer().catch(
  error => {

    console.error(
      "Server startup failed",
      error
    );

    process.exit(
      1
    );

  }
);