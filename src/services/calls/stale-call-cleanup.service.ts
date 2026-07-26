import {
  CallEventType,
  CallStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

const DEFAULT_STALE_MINUTES =
  30;

const DEFAULT_CHECK_INTERVAL_MS =
  5 * 60 * 1000;

let cleanupInterval:
  NodeJS.Timeout | null =
    null;

let cleanupRunning =
  false;

function getStaleMinutes():
  number {
  const rawValue =
    process.env
      .STALE_CALL_TIMEOUT_MINUTES
      ?.trim();

  const parsedValue =
    rawValue
      ? Number(rawValue)
      : DEFAULT_STALE_MINUTES;

  if (
    !Number.isFinite(
      parsedValue
    ) ||
    parsedValue < 1
  ) {
    console.warn(
      "Invalid STALE_CALL_TIMEOUT_MINUTES; using 30"
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
      ? Number(rawValue)
      : DEFAULT_CHECK_INTERVAL_MS;

  if (
    !Number.isFinite(
      parsedValue
    ) ||
    parsedValue < 60_000
  ) {
    console.warn(
      "Invalid STALE_CALL_CHECK_INTERVAL_MS; using 5 minutes"
    );

    return DEFAULT_CHECK_INTERVAL_MS;
  }

  return parsedValue;
}

function getStaleCutoff():
  Date {
  const cutoff =
    new Date();

  cutoff.setMinutes(
    cutoff.getMinutes() -
      getStaleMinutes()
  );

  return cutoff;
}

export async function cleanupStaleQueuedCalls():
  Promise<number> {
  if (
    cleanupRunning
  ) {
    console.log(
      "Stale call cleanup already running"
    );

    return 0;
  }

  cleanupRunning =
    true;

  try {
    const cutoff =
      getStaleCutoff();

    const staleCalls =
      await prisma.call.findMany({
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

          campaignId:
            true,

          campaignRunId:
            true,

          providerCallId:
            true,

          updatedAt:
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
      console.log(
        "No stale queued calls found"
      );

      return 0;
    }

    const now =
      new Date();

    const staleCallIds =
      staleCalls.map(
        (
          call
        ) =>
          call.id
      );

    const result =
      await prisma.$transaction(
        async (
          transaction
        ) => {
          const updateResult =
            await transaction.call.updateMany({
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
            await transaction.call.findMany({
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

                campaignId:
                  true,

                campaignRunId:
                  true,

                providerCallId:
                  true,
              },
            });

          if (
            updatedCalls.length >
            0
          ) {
            await transaction.callEvent.createMany({
              data:
                updatedCalls.map(
                  (
                    call
                  ) => ({
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
                        getStaleMinutes(),

                      providerCallId:
                        call.providerCallId,

                      campaignId:
                        call.campaignId,

                      campaignRunId:
                        call.campaignRunId,

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

    console.warn(
      "Stale queued calls marked as failed",
      {
        count:
          result,

        cutoff:
          cutoff.toISOString(),

        callIds:
          staleCallIds,
      }
    );

    return result;
  } catch (
    error
  ) {
    console.error(
      "Stale queued call cleanup failed",
      error
    );

    return 0;
  } finally {
    cleanupRunning =
      false;
  }
}

export function initializeStaleCallCleanup():
  void {
  if (
    cleanupInterval
  ) {
    console.log(
      "Stale call cleanup already initialized"
    );

    return;
  }

  void cleanupStaleQueuedCalls();

  const intervalMs =
    getCheckIntervalMs();

  cleanupInterval =
    setInterval(
      () => {
        void cleanupStaleQueuedCalls();
      },
      intervalMs
    );

  cleanupInterval.unref?.();

  console.log(
    "Stale call cleanup initialized",
    {
      timeoutMinutes:
        getStaleMinutes(),

      intervalMs,
    }
  );
}

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

  console.log(
    "Stale call cleanup closed"
  );
}