import {
  loadEnvConfig,
} from "@next/env";


/**
 * Load Next.js environment files before
 * importing Redis, BullMQ workers or the
 * application server.
 */
loadEnvConfig(
  process.cwd()
);


async function bootstrap():
  Promise<void> {


  //----------------------------------------
  // Initialize Background Workers
  //----------------------------------------

  const {
    initializeWorkers,
    closeWorkers,
  } = await import(
    "@/workers/initialize-workers"
  );


  initializeWorkers();


  //----------------------------------------
  // Start Main Application Server
  //----------------------------------------

  await import(
    "./server"
  );


  console.info(
    "Server and background workers initialized successfully"
  );


  //----------------------------------------
  // Graceful Shutdown
  //----------------------------------------

  const shutdown =
    async (
      signal:
        string
    ): Promise<void> => {

      console.info(
        "Shutdown signal received",
        {
          signal,
        }
      );


      try {

        await closeWorkers();

      }

      catch (
        error:
          unknown
      ) {

        console.error(
          "Failed to close workers",
          {

            error:
              error instanceof Error
                ? error.message
                : String(
                    error
                  ),

          }
        );

      }


      process.exit(
        0
      );

    };


  process.once(
    "SIGINT",
    () => {
      void shutdown(
        "SIGINT"
      );
    }
  );


  process.once(
    "SIGTERM",
    () => {
      void shutdown(
        "SIGTERM"
      );
    }
  );

}


bootstrap().catch(
  (
    error:
      unknown
  ) => {

    console.error(
      "Server bootstrap failed",
      {

        error:
          error instanceof Error
            ? error.message
            : String(
                error
              ),

        stack:
          error instanceof Error
            ? error.stack
            : undefined,

      }
    );


    process.exit(
      1
    );

  }
);