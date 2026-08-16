import {
  CallStatus,
  CampaignRunStatus,
  CampaignStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCampaignRunLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Finalizer Result
//--------------------------------------------------

export interface CampaignFinalizationResult {
  campaignId: string;

  campaignRunId: string;

  finalized: boolean;

  skipped: boolean;

  reason: string;

  runStatus: CampaignRunStatus;

  totalContacts: number;

  processedContacts: number;

  settledContacts: number;

  unresolvedContacts: number;

  completedContacts: number;

  unsuccessfulContacts: number;
}

//--------------------------------------------------
// Final Call Statuses
//--------------------------------------------------

const TERMINAL_CALL_STATUSES:
  readonly CallStatus[] = [
    CallStatus.COMPLETED,
    CallStatus.FAILED,
    CallStatus.BUSY,
    CallStatus.NO_ANSWER,
    CallStatus.CANCELED,
  ];

//--------------------------------------------------
// Finalize Campaign Run When Ready
//--------------------------------------------------

export async function finalizeCampaignRunIfReady(
  campaignRunId: string
): Promise<CampaignFinalizationResult> {
  const startedAt =
    process.hrtime.bigint();

  const initialLog =
    createCampaignRunLogger(
      campaignRunId
    );

  initialLog.debug(
    {
      event:
        "campaign.finalization.check.started",
    },
    "Campaign finalization check started"
  );

  try {
    //------------------------------------------------
    // Load Campaign Run
    //------------------------------------------------

    const campaignRun =
      await prisma.campaignRun.findUnique({
        where: {
          id:
            campaignRunId,
        },

        select: {
          id:
            true,

          campaignId:
            true,

          status:
            true,

          total:
            true,

          processed:
            true,

          completedAt:
            true,
        },
      });

    if (
      !campaignRun
    ) {
      throw new Error(
        `Campaign run not found: ${campaignRunId}`
      );
    }

    const log =
      createCampaignRunLogger(
        campaignRun.id,
        campaignRun.campaignId
      );

    //------------------------------------------------
    // Already Final
    //------------------------------------------------

    if (
      campaignRun.status ===
        CampaignRunStatus.COMPLETED ||
      campaignRun.status ===
        CampaignRunStatus.FAILED ||
      campaignRun.status ===
        CampaignRunStatus.CANCELLED
    ) {
      const result:
        CampaignFinalizationResult = {
          campaignId:
            campaignRun.campaignId,

          campaignRunId:
            campaignRun.id,

          finalized:
            false,

          skipped:
            true,

          reason:
            "Campaign run is already in a terminal state",

          runStatus:
            campaignRun.status,

          totalContacts:
            campaignRun.total,

          processedContacts:
            campaignRun.processed,

          settledContacts:
            0,

          unresolvedContacts:
            0,

          completedContacts:
            0,

          unsuccessfulContacts:
            0,
        };

      log.debug(
        {
          event:
            "campaign.finalization.check.skipped",

          reason:
            result.reason,

          runStatus:
            result.runStatus,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Campaign finalization skipped"
      );

      return result;
    }

    //------------------------------------------------
    // Wait Until Initial Dispatch Is Finished
    //------------------------------------------------

    if (
      campaignRun.processed <
      campaignRun.total
    ) {
      const unresolvedContacts =
        Math.max(
          campaignRun.total -
            campaignRun.processed,
          0
        );

      const result:
        CampaignFinalizationResult = {
          campaignId:
            campaignRun.campaignId,

          campaignRunId:
            campaignRun.id,

          finalized:
            false,

          skipped:
            true,

          reason:
            "Initial campaign dispatch is still running",

          runStatus:
            campaignRun.status,

          totalContacts:
            campaignRun.total,

          processedContacts:
            campaignRun.processed,

          settledContacts:
            0,

          unresolvedContacts,

          completedContacts:
            0,

          unsuccessfulContacts:
            0,
        };

      log.debug(
        {
          event:
            "campaign.finalization.check.skipped",

          reason:
            result.reason,

          totalContacts:
            campaignRun.total,

          processedContacts:
            campaignRun.processed,

          unresolvedContacts,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Campaign finalization skipped"
      );

      return result;
    }

    //------------------------------------------------
    // Empty Campaign
    //------------------------------------------------

    if (
      campaignRun.total ===
      0
    ) {
      return finalizeEmptyCampaignRun({
        campaignId:
          campaignRun.campaignId,

        campaignRunId:
          campaignRun.id,

        startedAt,
      });
    }

    //------------------------------------------------
    // Load Every Call Attempt
    //------------------------------------------------

    const calls =
      await prisma.call.findMany({
        where: {
          campaignRunId:
            campaignRun.id,
        },

        select: {
          id:
            true,

          contactId:
            true,

          status:
            true,

          attemptNumber:
            true,

          maxAttempts:
            true,

          nextRetryAt:
            true,

          createdAt:
            true,
        },

        orderBy: [
          {
            contactId:
              "asc",
          },

          {
            attemptNumber:
              "desc",
          },

          {
            createdAt:
              "desc",
          },
        ],
      });

    //------------------------------------------------
    // Latest Attempt Per Contact
    //------------------------------------------------

    const latestCallByContact =
      new Map<
        string,
        typeof calls[number]
      >();

    for (
      const call of
      calls
    ) {
      const existing =
        latestCallByContact.get(
          call.contactId
        );

      if (
        !existing
      ) {
        latestCallByContact.set(
          call.contactId,
          call
        );

        continue;
      }

      if (
        call.attemptNumber >
        existing.attemptNumber
      ) {
        latestCallByContact.set(
          call.contactId,
          call
        );

        continue;
      }

      if (
        call.attemptNumber ===
          existing.attemptNumber &&
        call.createdAt.getTime() >
          existing.createdAt.getTime()
      ) {
        latestCallByContact.set(
          call.contactId,
          call
        );
      }
    }

    //------------------------------------------------
    // Calculate Final Outcome State
    //------------------------------------------------

    let unresolvedContacts =
      0;

    let completedContacts =
      0;

    let unsuccessfulContacts =
      0;

    for (
      const latestCall of
      latestCallByContact.values()
    ) {
      const isTerminal =
        TERMINAL_CALL_STATUSES.includes(
          latestCall.status
        );

      const hasPendingRetry =
        latestCall.nextRetryAt !==
        null;

      if (
        !isTerminal ||
        hasPendingRetry
      ) {
        unresolvedContacts +=
          1;

        continue;
      }

      if (
        latestCall.status ===
        CallStatus.COMPLETED
      ) {
        completedContacts +=
          1;
      } else {
        unsuccessfulContacts +=
          1;
      }
    }

    /*
     * A contact whose initial dispatch failed may have
     * no Call record.
     */
    const contactsWithoutCall =
      Math.max(
        campaignRun.processed -
          latestCallByContact.size,
        0
      );

    unsuccessfulContacts +=
      contactsWithoutCall;

    const settledContacts =
      completedContacts +
      unsuccessfulContacts;

    log.debug(
      {
        event:
          "campaign.finalization.outcomes.calculated",

        totalContacts:
          campaignRun.total,

        processedContacts:
          campaignRun.processed,

        callAttempts:
          calls.length,

        uniqueAttemptedContacts:
          latestCallByContact.size,

        contactsWithoutCall,

        settledContacts,

        unresolvedContacts,

        completedContacts,

        unsuccessfulContacts,
      },
      "Campaign contact outcomes calculated"
    );

    //------------------------------------------------
    // Do Not Finalize While Calls Or Retries Remain
    //------------------------------------------------

    if (
      unresolvedContacts >
      0
    ) {
      const result:
        CampaignFinalizationResult = {
          campaignId:
            campaignRun.campaignId,

          campaignRunId:
            campaignRun.id,

          finalized:
            false,

          skipped:
            true,

          reason:
            "Calls or retries are still unresolved",

          runStatus:
            CampaignRunStatus.RUNNING,

          totalContacts:
            campaignRun.total,

          processedContacts:
            campaignRun.processed,

          settledContacts,

          unresolvedContacts,

          completedContacts,

          unsuccessfulContacts,
        };

      log.debug(
        {
          event:
            "campaign.finalization.check.skipped",

          reason:
            result.reason,

          settledContacts,

          unresolvedContacts,

          completedContacts,

          unsuccessfulContacts,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Campaign finalization skipped"
      );

      return result;
    }

    //------------------------------------------------
    // Ensure Every Processed Contact Is Settled
    //------------------------------------------------

    if (
      settledContacts <
      campaignRun.processed
    ) {
      const missingSettledContacts =
        Math.max(
          campaignRun.processed -
            settledContacts,
          0
        );

      const result:
        CampaignFinalizationResult = {
          campaignId:
            campaignRun.campaignId,

          campaignRunId:
            campaignRun.id,

          finalized:
            false,

          skipped:
            true,

          reason:
            "Not every processed contact has a settled outcome",

          runStatus:
            CampaignRunStatus.RUNNING,

          totalContacts:
            campaignRun.total,

          processedContacts:
            campaignRun.processed,

          settledContacts,

          unresolvedContacts:
            missingSettledContacts,

          completedContacts,

          unsuccessfulContacts,
        };

      log.warn(
        {
          event:
            "campaign.finalization.check.incomplete",

          reason:
            result.reason,

          settledContacts,

          processedContacts:
            campaignRun.processed,

          missingSettledContacts,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Campaign outcomes are not fully accounted for"
      );

      return result;
    }

    //------------------------------------------------
    // Resolve Final Campaign Status
    //------------------------------------------------

    const finalRunStatus =
      completedContacts >
      0
        ? CampaignRunStatus.COMPLETED
        : CampaignRunStatus.FAILED;

    const finalCampaignStatus =
      finalRunStatus ===
      CampaignRunStatus.COMPLETED
        ? CampaignStatus.COMPLETED
        : CampaignStatus.FAILED;

    const completedAt =
      new Date();

    //------------------------------------------------
    // Protect Against Old Run Finalizing New Campaign
    //------------------------------------------------

    const latestRun =
      await prisma.campaignRun.findFirst({
        where: {
          campaignId:
            campaignRun.campaignId,
        },

        orderBy: {
          createdAt:
            "desc",
        },

        select: {
          id:
            true,
        },
      });

    const isLatestRun =
      latestRun?.id ===
      campaignRun.id;

//------------------------------------------------
// Persist Final Run State
//------------------------------------------------

const persistenceResult =
  await prisma.$transaction(
    async transaction => {
      //------------------------------------------------
      // Latest Run Also Owns Campaign State
      //------------------------------------------------

      if (
        isLatestRun
      ) {
        /*
         * Claim the campaign final transition first.
         *
         * If cancellation has already changed the
         * campaign away from RUNNING, do not finalize
         * the run either.
         */

        const campaignUpdate =
          await transaction.campaign
            .updateMany({
              where: {
                id:
                  campaignRun.campaignId,

                status:
                  CampaignStatus.RUNNING,
              },

              data: {
                status:
                  finalCampaignStatus,

                completedAt,
              },
            });

        if (
          campaignUpdate.count ===
          0
        ) {
          return {
            runUpdateCount:
              0,

            campaignUpdateCount:
              0,
          };
        }

        //------------------------------------------------
        // Finalize Run
        //------------------------------------------------

        const runUpdate =
          await transaction.campaignRun
            .updateMany({
              where: {
                id:
                  campaignRun.id,

                status:
                  CampaignRunStatus.RUNNING,
              },

              data: {
                status:
                  finalRunStatus,

                completedAt,
              },
            });

        /*
         * If another process changed the run while
         * campaign update succeeded, abort this
         * transaction so the campaign update rolls
         * back as well.
         */

        if (
          runUpdate.count ===
          0
        ) {
          throw new Error(
            "Campaign run changed during finalization"
          );
        }

        return {
          runUpdateCount:
            runUpdate.count,

          campaignUpdateCount:
            campaignUpdate.count,
        };
      }

      //------------------------------------------------
      // Historical Run Only
      //------------------------------------------------

      const runUpdate =
        await transaction.campaignRun
          .updateMany({
            where: {
              id:
                campaignRun.id,

              status:
                CampaignRunStatus.RUNNING,
            },

            data: {
              status:
                finalRunStatus,

              completedAt,
            },
          });

      return {
        runUpdateCount:
          runUpdate.count,

        campaignUpdateCount:
          0,
      };
    }
  );

//------------------------------------------------
// Did We Win The Finalization Race?
//------------------------------------------------

const finalized =
  persistenceResult
    .runUpdateCount >
  0;

//------------------------------------------------
// Reload Actual Run State On Concurrent Skip
//------------------------------------------------

const currentRun =
  finalized
    ? null
    : await prisma.campaignRun
        .findUnique({
          where: {
            id:
              campaignRun.id,
          },

          select: {
            status:
              true,
          },
        });

const effectiveRunStatus =
  finalized
    ? finalRunStatus
    : currentRun?.status ??
      campaignRun.status;

//------------------------------------------------
// Log
//------------------------------------------------

log.info(
  {
    event:
      finalized
        ? "campaign.finalization.completed"
        : "campaign.finalization.concurrent_skip",

    finalRunStatus:
      finalized
        ? finalRunStatus
        : undefined,

    effectiveRunStatus,

    finalCampaignStatus:
      finalized &&
      isLatestRun
        ? finalCampaignStatus
        : undefined,

    totalContacts:
      campaignRun.total,

    processedContacts:
      campaignRun.processed,

    settledContacts,

    completedContacts,

    unsuccessfulContacts,

    isLatestRun,

    runUpdateCount:
      persistenceResult
        .runUpdateCount,

    campaignUpdateCount:
      persistenceResult
        .campaignUpdateCount,

    completedAt:
      completedAt.toISOString(),

    durationMs:
      getDurationMs(
        startedAt
      ),
  },
  finalized
    ? "Campaign run finalized from call outcomes"
    : "Campaign run finalization lost a concurrent state transition"
);

//------------------------------------------------
// Result
//------------------------------------------------

return {
  campaignId:
    campaignRun.campaignId,

  campaignRunId:
    campaignRun.id,

  finalized,

  skipped:
    !finalized,

  reason:
    finalized
      ? "Every processed contact has a settled final outcome"
      : effectiveRunStatus ===
          CampaignRunStatus.CANCELLED
        ? "Campaign run was cancelled concurrently"
        : "Campaign run state changed before finalization",

  runStatus:
    effectiveRunStatus,

  totalContacts:
    campaignRun.total,

  processedContacts:
    campaignRun.processed,

  settledContacts,

  unresolvedContacts:
    0,

  completedContacts,

  unsuccessfulContacts,
};
  } catch (
    error
  ) {
    initialLog.error(
      {
        event:
          "campaign.finalization.check.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Campaign finalization check failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Finalize Empty Campaign
//--------------------------------------------------

async function finalizeEmptyCampaignRun(
  input: {
    campaignId: string;

    campaignRunId: string;

    startedAt: bigint;
  }
): Promise<CampaignFinalizationResult> {
  const log =
    createCampaignRunLogger(
      input.campaignRunId,
      input.campaignId
    );

  const completedAt =
    new Date();

  const [
    runUpdate,
    campaignUpdate,
  ] =
    await prisma.$transaction([
      prisma.campaignRun.updateMany({
        where: {
          id:
            input.campaignRunId,

          status: {
            in: [
              CampaignRunStatus.QUEUED,
              CampaignRunStatus.RUNNING,
            ],
          },
        },

        data: {
          status:
            CampaignRunStatus.COMPLETED,

          completedAt,
        },
      }),

      prisma.campaign.updateMany({
        where: {
          id:
            input.campaignId,

          status: {
            in: [
              CampaignStatus.QUEUED,
              CampaignStatus.RUNNING,
            ],
          },
        },

        data: {
          status:
            CampaignStatus.COMPLETED,

          completedAt,
        },
      }),
    ]);

  const finalized =
    runUpdate.count >
    0;

//------------------------------------------------
// Resolve Actual State After Concurrent Skip
//------------------------------------------------

const currentRun =
  finalized
    ? null
    : await prisma.campaignRun
        .findUnique({
          where: {
            id:
              input.campaignRunId,
          },

          select: {
            status:
              true,
          },
        });

const effectiveRunStatus =
  finalized
    ? CampaignRunStatus.COMPLETED
    : currentRun?.status ??
      CampaignRunStatus.COMPLETED;

  log.info(
    {
      event:
        finalized
          ? "campaign.finalization.empty.completed"
          : "campaign.finalization.empty.concurrent_skip",

      runUpdateCount:
        runUpdate.count,

      campaignUpdateCount:
        campaignUpdate.count,

      completedAt:
        completedAt.toISOString(),

      durationMs:
        getDurationMs(
          input.startedAt
        ),
    },
finalized
  ? "Empty campaign run finalized"
  : "Empty campaign run finalization lost a concurrent state transition"
  );

  return {
    campaignId:
      input.campaignId,

    campaignRunId:
      input.campaignRunId,

    finalized,

    skipped:
      !finalized,

reason:
  finalized
    ? "Empty campaign run finalized"
    : effectiveRunStatus ===
        CampaignRunStatus.CANCELLED
      ? "Empty campaign run was cancelled concurrently"
      : "Empty campaign run state changed concurrently",

runStatus:
  effectiveRunStatus,

    totalContacts:
      0,

    processedContacts:
      0,

    settledContacts:
      0,

    unresolvedContacts:
      0,

    completedContacts:
      0,

    unsuccessfulContacts:
      0,
  };
}