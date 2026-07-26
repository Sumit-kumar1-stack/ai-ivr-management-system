import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface ProcessResource {
  name: string;

  close:
    () =>
      Promise<void> |
      void;
}

export interface ProcessLifecycleOptions {
  processName: string;

  resources:
    readonly ProcessResource[];

  shutdownTimeoutMs?:
    number;

  loggerComponent?:
    string;
}

//--------------------------------------------------
// Constants
//--------------------------------------------------

const DEFAULT_SHUTDOWN_TIMEOUT_MS =
  30_000;

const MIN_SHUTDOWN_TIMEOUT_MS =
  5_000;

const MAX_SHUTDOWN_TIMEOUT_MS =
  120_000;

//--------------------------------------------------
// Register Process Lifecycle
//--------------------------------------------------

export function registerProcessLifecycle(
  options:
    ProcessLifecycleOptions
): {
  shutdown:
    (
      reason: string,
      exitCode?: number
    ) => Promise<void>;
} {
  const log =
    createServerLogger(
      options.loggerComponent ??
      `${options.processName}-lifecycle`
    );

  const timeoutMs =
    resolveShutdownTimeout(
      options.shutdownTimeoutMs
    );

  let shutdownPromise:
    Promise<void> |
    null =
      null;

  //------------------------------------------------
  // Shared Shutdown Function
  //------------------------------------------------

  const shutdown =
    (
      reason: string,
      exitCode =
        0
    ): Promise<void> => {
      if (
        shutdownPromise
      ) {
        log.warn(
          {
            event:
              "process.shutdown.duplicate",

            processName:
              options.processName,

            reason,
          },
          "Process shutdown is already in progress"
        );

        return shutdownPromise;
      }

      shutdownPromise =
        performShutdown({
          processName:
            options.processName,

          resources:
            options.resources,

          reason,

          requestedExitCode:
            exitCode,

          timeoutMs,

          log,
        });

      return shutdownPromise;
    };

  //------------------------------------------------
  // Operating-System Signals
  //------------------------------------------------

  process.once(
    "SIGINT",
    () => {
      void shutdown(
        "SIGINT",
        0
      );
    }
  );

  process.once(
    "SIGTERM",
    () => {
      void shutdown(
        "SIGTERM",
        0
      );
    }
  );

  //------------------------------------------------
  // Fatal Process Errors
  //------------------------------------------------

  process.once(
    "uncaughtException",
    (
      error: Error
    ) => {
      log.fatal(
        {
          event:
            "process.uncaught_exception",

          processName:
            options.processName,

          error:
            normalizeError(
              error
            ),
        },
        "Uncaught process exception"
      );

      void shutdown(
        "uncaughtException",
        1
      );
    }
  );

  process.once(
    "unhandledRejection",
    (
      reason: unknown
    ) => {
      log.fatal(
        {
          event:
            "process.unhandled_rejection",

          processName:
            options.processName,

          error:
            normalizeError(
              reason
            ),
        },
        "Unhandled process rejection"
      );

      void shutdown(
        "unhandledRejection",
        1
      );
    }
  );

  log.info(
    {
      event:
        "process.lifecycle.registered",

      processName:
        options.processName,

      shutdownTimeoutMs:
        timeoutMs,

      resources:
        options.resources.map(
          resource =>
            resource.name
        ),
    },
    "Process lifecycle handlers registered"
  );

  return {
    shutdown,
  };
}

//--------------------------------------------------
// Perform Ordered Shutdown
//--------------------------------------------------

async function performShutdown(
  input: {
    processName: string;

    resources:
      readonly ProcessResource[];

    reason: string;

    requestedExitCode:
      number;

    timeoutMs:
      number;

    log:
      ReturnType<
        typeof createServerLogger
      >;
  }
): Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  let exitCode =
    input.requestedExitCode;

  const failures:
    Array<{
      resource: string;

      error: ReturnType<
        typeof normalizeError
      >;
    }> = [];

  input.log.info(
    {
      event:
        "process.shutdown.started",

      processName:
        input.processName,

      reason:
        input.reason,

      requestedExitCode:
        input.requestedExitCode,

      timeoutMs:
        input.timeoutMs,

      resourceCount:
        input.resources.length,
    },
    "Process shutdown started"
  );

  //------------------------------------------------
  // Forced Shutdown Timeout
  //------------------------------------------------

  const timeout =
    setTimeout(
      () => {
        input.log.fatal(
          {
            event:
              "process.shutdown.timeout",

            processName:
              input.processName,

            reason:
              input.reason,

            timeoutMs:
              input.timeoutMs,

            durationMs:
              getDurationMs(
                startedAt
              ),
          },
          "Process shutdown exceeded its timeout"
        );

        process.exit(
          1
        );
      },
      input.timeoutMs
    );

  timeout.unref?.();

  //------------------------------------------------
  // Close Resources In Supplied Order
  //------------------------------------------------

  try {
    for (
      const resource of
      input.resources
    ) {
      await closeResource({
        processName:
          input.processName,

        resource,

        failures,

        log:
          input.log,
      });
    }

    if (
      failures.length >
      0
    ) {
      exitCode =
        1;

      input.log.error(
        {
          event:
            "process.shutdown.partial_failure",

          processName:
            input.processName,

          reason:
            input.reason,

          failedResources:
            failures.map(
              failure =>
                failure.resource
            ),

          failures,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Process shutdown completed with resource failures"
      );
    } else {
      input.log.info(
        {
          event:
            "process.shutdown.completed",

          processName:
            input.processName,

          reason:
            input.reason,

          exitCode,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Process resources closed successfully"
      );
    }
  } catch (
    error
  ) {
    exitCode =
      1;

    input.log.error(
      {
        event:
          "process.shutdown.failed",

        processName:
          input.processName,

        reason:
          input.reason,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Unexpected process shutdown failure"
    );
  } finally {
    clearTimeout(
      timeout
    );

    /*
     * Allow buffered logger output a short period
     * to flush before terminating the process.
     */
    await wait(
      50
    );

    process.exit(
      exitCode
    );
  }
}

//--------------------------------------------------
// Close One Resource
//--------------------------------------------------

async function closeResource(
  input: {
    processName: string;

    resource:
      ProcessResource;

    failures:
      Array<{
        resource: string;

        error: ReturnType<
          typeof normalizeError
        >;
      }>;

    log:
      ReturnType<
        typeof createServerLogger
      >;
  }
): Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  input.log.info(
    {
      event:
        "process.resource.close.started",

      processName:
        input.processName,

      resource:
        input.resource.name,
    },
    "Process resource shutdown started"
  );

  try {
    await input.resource.close();

    input.log.info(
      {
        event:
          "process.resource.close.completed",

        processName:
          input.processName,

        resource:
          input.resource.name,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Process resource closed"
    );
  } catch (
    error
  ) {
    const normalizedError =
      normalizeError(
        error
      );

    input.failures.push({
      resource:
        input.resource.name,

      error:
        normalizedError,
    });

    input.log.error(
      {
        event:
          "process.resource.close.failed",

        processName:
          input.processName,

        resource:
          input.resource.name,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizedError,
      },
      "Process resource failed to close"
    );
  }
}

//--------------------------------------------------
// Resolve Shutdown Timeout
//--------------------------------------------------

function resolveShutdownTimeout(
  explicitTimeout:
    number |
    undefined
): number {
  const environmentValue =
    process.env
      .SHUTDOWN_TIMEOUT_MS
      ?.trim();

  const candidate =
    explicitTimeout ??
    (
      environmentValue
        ? Number(
            environmentValue
          )
        : DEFAULT_SHUTDOWN_TIMEOUT_MS
    );

  if (
    !Number.isInteger(
      candidate
    ) ||
    candidate <
      MIN_SHUTDOWN_TIMEOUT_MS ||
    candidate >
      MAX_SHUTDOWN_TIMEOUT_MS
  ) {
    return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  }

  return candidate;
}

//--------------------------------------------------
// Small Delay
//--------------------------------------------------

function wait(
  milliseconds: number
): Promise<void> {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}