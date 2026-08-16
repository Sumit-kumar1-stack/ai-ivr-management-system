import {
  CallEventType,
  CallStatus,
} from "@prisma/client";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

//--------------------------------------------------
// Configuration
//--------------------------------------------------

const DEFAULT_STALE_MINUTES =
  30;

const DEFAULT_CHECK_INTERVAL_MS =
  5 * 60 * 1000;

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "stale-call-cleanup"
  );

//--------------------------------------------------
// Runtime State
//--------------------------------------------------

let cleanupInterval:
  NodeJS.Timeout |
  null =
    null;

let cleanupRunning =
  false;

//--------------------------------------------------
// Configuration Helpers
//--------------------------------------------------

function getStaleMinutes():
  number {
  const rawValue =
    process.env
      .STALE_CALL_TIMEOUT_MINUTES
      ?.trim();

  const parsedValue =
    rawValue
      ? Number(
          rawValue
        )
      : DEFAULT_STALE_MINUTES;

  if (
    !Number.isFinite(
      parsedValue
    ) ||
    parsedValue <
      1
  ) {
    log.warn(
      {
        event:
          "stale_call.config_invalid",

        configName:
          "STALE_CALL_TIMEOUT_MINUTES",

        configuredValuePresent:
          Boolean(
            rawValue
          ),

        fallbackValue:
          DEFAULT_STALE_MINUTES,
      },
      "Invalid stale-call timeout configuration"
    );

    return DEFAULT_STALE_MINUTES;
  }

  return parsedValue;
}

function getCheckIntervalMs():
  number {
  const rawValue =
    process.env
      .STALE_CALL_CHECK_INTERVAL_MS
      ?.trim();

  const parsedValue =
    rawValue
      ? Number(
          rawValue
        )
      : DEFAULT_CHECK_INTERVAL_MS;

  if (
    !Number.isFinite(
      parsedValue
    ) ||
    parsedValue <
      60_000
  ) {
    log.warn(
      {
        event:
          "stale_call.config_invalid",

        configName:
          "STALE_CALL_CHECK_INTERVAL_MS",

        configuredValuePresent:
          Boolean(
            rawValue
          ),

        fallbackValue:
          DEFAULT_CHECK_INTERVAL_MS,
      },
      "Invalid stale-call cleanup interval configuration"
    );

    return DEFAULT_CHECK_INTERVAL_MS;
  }

  return parsedValue;
}

function getStaleCutoff(
  staleMinutes: number
): Date {
  const cutoff =
    new Date();

  cutoff.setMinutes(
    cutoff.getMinutes() -
      staleMinutes
  );

  return cutoff;
}

//--------------------------------------------------
// Cleanup Stale Queued Calls
//--------------------------------------------------

export async function cleanupStaleQueuedCalls():
  Promise<number> {
  if (
    cleanupRunning
  ) {
    log.debug(
      {
        event:
          "stale_call.cleanup_skipped",

        reason:
          "cleanup_already_running",
      },
      "Stale-call cleanup is already running"
    );

    return 0;
  }

  cleanupRunning =
    true;

  const staleMinutes =
    getStaleMinutes();

  try {
    const cutoff =
      getStaleCutoff(
        staleMinutes
      );

    const staleCalls =
      await prisma.call
        .findMany({
          where: {
            status:
              CallStatus.QUEUED,

            updatedAt: {
              lt:
                cutoff,
            },
          },

          select: {
            id:
              true,
          },

          orderBy: {
            updatedAt:
              "asc",
          },

          take:
            500,
        });

    if (
      staleCalls.length ===
      0
    ) {
      log.debug(
        {
          event:
            "stale_call.cleanup_completed",

          staleCandidateCount:
            0,

          updatedCallCount:
            0,
        },
        "No stale queued calls found"
      );

      return 0;
    }

    const now =
      new Date();

    const staleCallIds =
      staleCalls.map(
        call =>
          call.id
      );

    const result =
      await prisma.$transaction(
        async transaction => {
          const updateResult =
            await transaction.call
              .updateMany({
                where: {
                  id: {
                    in:
                      staleCallIds,
                  },

                  status:
                    CallStatus.QUEUED,

                  updatedAt: {
                    lt:
                      cutoff,
                  },
                },

                data: {
                  status:
                    CallStatus.FAILED,

                  failedAt:
                    now,

                  endedAt:
                    now,
                },
              });

          const updatedCalls =
            await transaction.call
              .findMany({
                where: {
                  id: {
                    in:
                      staleCallIds,
                  },

                  status:
                    CallStatus.FAILED,

                  failedAt:
                    now,
                },

                select: {
                  id:
                    true,
                },
              });

          if (
            updatedCalls.length >
            0
          ) {
            await transaction.callEvent
              .createMany({
                data:
                  updatedCalls.map(
                    call => ({
                      callId:
                        call.id,

                      type:
                        CallEventType.FAILED,

                      message:
                        "call.stale_queue_timeout",

                      payload: {
                        reason:
                          "STALE_QUEUE_TIMEOUT",

                        previousStatus:
                          CallStatus.QUEUED,

                        newStatus:
                          CallStatus.FAILED,

                        timeoutMinutes:
                          staleMinutes,

                        cleanedAt:
                          now.toISOString(),
                      },
                    })
                  ),
              });
          }

          return updateResult.count;
        }
      );

    log.warn(
      {
        event:
          "stale_call.cleanup_completed",

        staleCandidateCount:
          staleCalls.length,

        updatedCallCount:
          result,

        timeoutMinutes:
          staleMinutes,

        cutoffTimestamp:
          cutoff.toISOString(),
      },
      "Stale queued calls marked as failed"
    );

    return result;
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "stale_call.cleanup_failed",

        timeoutMinutes:
          staleMinutes,

        error:
          normalizeError(
            error
          ),
      },
      "Stale queued call cleanup failed"
    );

    return 0;
  } finally {
    cleanupRunning =
      false;
  }
}

//--------------------------------------------------
// Initialize Cleanup
//--------------------------------------------------

export function initializeStaleCallCleanup():
  void {
  if (
    cleanupInterval
  ) {
    log.debug(
      {
        event:
          "stale_call.initialization_skipped",

        reason:
          "already_initialized",
      },
      "Stale-call cleanup is already initialized"
    );

    return;
  }

  const staleMinutes =
    getStaleMinutes();

  const intervalMs =
    getCheckIntervalMs();

  void cleanupStaleQueuedCalls();

  cleanupInterval =
    setInterval(
      () => {
        void cleanupStaleQueuedCalls();
      },
      intervalMs
    );

  cleanupInterval.unref?.();

  log.info(
    {
      event:
        "stale_call.initialized",

      timeoutMinutes:
        staleMinutes,

      intervalMilliseconds:
        intervalMs,
    },
    "Stale-call cleanup initialized"
  );
}

//--------------------------------------------------
// Close Cleanup
//--------------------------------------------------

export function closeStaleCallCleanup():
  void {
  if (
    !cleanupInterval
  ) {
    return;
  }

  clearInterval(
    cleanupInterval
  );

  cleanupInterval =
    null;

  log.info(
    {
      event:
        "stale_call.closed",
    },
    "Stale-call cleanup closed"
  );
}