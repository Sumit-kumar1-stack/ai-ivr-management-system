import {
  CallStatus,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  prisma,
} from "@/lib/prisma";

import {
  asyncHandler,
} from "@/lib/async-handler";

import {
  requireRole,
} from "@/lib/auth";

import {
  CampaignNotFoundError,
} from "@/lib/app-error";

//--------------------------------------------------
// Route Context
//--------------------------------------------------

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

//--------------------------------------------------
// Latest Call Shape
//--------------------------------------------------

interface LatestRunCall {
  id: string;

  contactId: string;

  status: CallStatus;

  attemptNumber: number;

  maxAttempts: number;

  nextRetryAt: Date | null;

  createdAt: Date;
}

//--------------------------------------------------
// Campaign Statistics
//--------------------------------------------------

export const GET =
  asyncHandler<RouteContext>(
    async (
      _request: NextRequest,
      context: RouteContext
    ): Promise<NextResponse> => {
      //------------------------------------------------
      // Authorization
      //------------------------------------------------

      await requireRole([
        "AGENT",
        "ADMIN",
        "SUPER_ADMIN",
      ]);

      //------------------------------------------------
      // Campaign ID
      //------------------------------------------------

      const {
        id: campaignId,
      } = await context.params;

      //------------------------------------------------
      // Campaign
      //------------------------------------------------

      const campaign =
        await prisma.campaign.findUnique({
          where: {
            id:
              campaignId,
          },

          select: {
            id:
              true,

            name:
              true,

            description:
              true,

            language:
              true,

            voice:
              true,

            status:
              true,

            scheduledAt:
              true,

            startedAt:
              true,

            completedAt:
              true,

            createdAt:
              true,

            updatedAt:
              true,
          },
        });

      if (
        !campaign
      ) {
        throw new CampaignNotFoundError(
          campaignId
        );
      }

      //------------------------------------------------
      // Assigned Contacts And Latest Run
      //------------------------------------------------

      const [
        assignedContacts,
        latestRun,
      ] =
        await Promise.all([
          prisma.campaignContact.count({
            where: {
              campaignId,
            },
          }),

          prisma.campaignRun.findFirst({
            where: {
              campaignId,
            },

            orderBy: {
              createdAt:
                "desc",
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

              successful:
                true,

              failed:
                true,

              startedAt:
                true,

              completedAt:
                true,

              createdAt:
                true,

              updatedAt:
                true,
            },
          }),
        ]);

      const latestRunId =
        latestRun?.id ??
        "__NO_CAMPAIGN_RUN__";

      //------------------------------------------------
      // Load Statistics
      //------------------------------------------------

      const [
        latestRunCalls,
        latestRunStatusGroups,
        historicalStatusGroups,
        latestRunDuration,
        latestRunLifecycle,
        historicalDuration,
      ] =
        await Promise.all([
          //--------------------------------------------
          // All attempts from latest run
          //--------------------------------------------

          prisma.call.findMany({
            where: {
              campaignId,

              campaignRunId:
                latestRunId,
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
          }),

          //--------------------------------------------
          // Latest run attempt status groups
          //--------------------------------------------

          prisma.call.groupBy({
            by: [
              "status",
            ],

            where: {
              campaignId,

              campaignRunId:
                latestRunId,
            },

            _count: {
              _all:
                true,
            },
          }),

          //--------------------------------------------
          // Historical attempt status groups
          //--------------------------------------------

          prisma.call.groupBy({
            by: [
              "status",
            ],

            where: {
              campaignId,
            },

            _count: {
              _all:
                true,
            },
          }),

          //--------------------------------------------
          // Latest run completed durations
          //--------------------------------------------

          prisma.call.aggregate({
            where: {
              campaignId,

              campaignRunId:
                latestRunId,

              status:
                CallStatus.COMPLETED,
            },

            _sum: {
              duration:
                true,
            },

            _avg: {
              duration:
                true,
            },

            _min: {
              duration:
                true,
            },

            _max: {
              duration:
                true,
            },
          }),

          //--------------------------------------------
          // Latest run lifecycle
          //--------------------------------------------

          prisma.call.aggregate({
            where: {
              campaignId,

              campaignRunId:
                latestRunId,
            },

            _min: {
              requestedAt:
                true,

              queuedAt:
                true,

              ringingAt:
                true,

              answeredAt:
                true,

              completedAt:
                true,
            },

            _max: {
              requestedAt:
                true,

              queuedAt:
                true,

              ringingAt:
                true,

              answeredAt:
                true,

              completedAt:
                true,
            },
          }),

          //--------------------------------------------
          // Historical completed durations
          //--------------------------------------------

          prisma.call.aggregate({
            where: {
              campaignId,

              status:
                CallStatus.COMPLETED,
            },

            _sum: {
              duration:
                true,
            },

            _avg: {
              duration:
                true,
            },

            _min: {
              duration:
                true,
            },

            _max: {
              duration:
                true,
            },
          }),
        ]);

      //------------------------------------------------
      // Attempt-Level Status Counts
      //------------------------------------------------

      const latestCounts =
        buildStatusCounts(
          latestRunStatusGroups
        );

      const historicalCounts =
        buildStatusCounts(
          historicalStatusGroups
        );

      const latestTotalAttempts =
        sumStatusGroups(
          latestRunStatusGroups
        );

      const latestInitialAttempts =
        latestRunCalls.filter(
          call =>
            call.attemptNumber ===
            1
        ).length;

      const latestRetryAttempts =
        latestRunCalls.filter(
          call =>
            call.attemptNumber >
            1
        ).length;

      const latestQueuedAttempts =
        latestCounts[
          CallStatus.QUEUED
        ];

      const latestRingingAttempts =
        latestCounts[
          CallStatus.RINGING
        ];

      const latestCurrentlyAnsweredAttempts =
        latestCounts[
          CallStatus.ANSWERED
        ];

      const latestCompletedAttempts =
        latestCounts[
          CallStatus.COMPLETED
        ];

      const latestAnsweredAttempts =
        latestCurrentlyAnsweredAttempts +
        latestCompletedAttempts;

      const latestFailedAttempts =
        latestCounts[
          CallStatus.FAILED
        ];

      const latestBusyAttempts =
        latestCounts[
          CallStatus.BUSY
        ];

      const latestNoAnswerAttempts =
        latestCounts[
          CallStatus.NO_ANSWER
        ];

      const latestCanceledAttempts =
        latestCounts[
          CallStatus.CANCELED
        ];

      const latestUnsuccessfulAttempts =
        latestFailedAttempts +
        latestBusyAttempts +
        latestNoAnswerAttempts +
        latestCanceledAttempts;

      const latestActiveAttempts =
        latestQueuedAttempts +
        latestRingingAttempts +
        latestCurrentlyAnsweredAttempts;

      //------------------------------------------------
      // Latest Attempt Per Contact
      //------------------------------------------------

      const latestCallByContact =
        buildLatestCallByContact(
          latestRunCalls
        );

      let completedContacts =
        0;

      let activeContacts =
        0;

      let awaitingRetryContacts =
        0;

      let unsuccessfulContacts =
        0;

      for (
        const latestCall of
        latestCallByContact.values()
      ) {
        if (
          latestCall.status ===
          CallStatus.COMPLETED
        ) {
          completedContacts +=
            1;

          continue;
        }

        if (
          isActiveCallStatus(
            latestCall.status
          )
        ) {
          activeContacts +=
            1;

          continue;
        }

        if (
          latestCall.nextRetryAt
        ) {
          awaitingRetryContacts +=
            1;

          continue;
        }

        if (
          isTerminalCallStatus(
            latestCall.status
          )
        ) {
          unsuccessfulContacts +=
            1;
        }
      }

      //------------------------------------------------
      // Contact-Level Dispatch Metrics
      //------------------------------------------------

      const processedContacts =
        latestRun?.processed ??
        0;

      const attemptedContacts =
        latestCallByContact.size;

      /*
       * Initial dispatch failures may not create a Call
       * row. They are represented by processed contacts
       * minus unique contacts that have call attempts.
       */
      const dispatchFailedContacts =
        Math.max(
          processedContacts -
            attemptedContacts,
          0
        );

      const totalUnsuccessfulContacts =
        unsuccessfulContacts +
        dispatchFailedContacts;

      const notAttemptedContacts =
        Math.max(
          assignedContacts -
            processedContacts,
          0
        );

      const accountedContacts =
        completedContacts +
        activeContacts +
        awaitingRetryContacts +
        unsuccessfulContacts +
        dispatchFailedContacts;

      //------------------------------------------------
      // Dispatch Metrics
      //------------------------------------------------

      const dispatchTotal =
        latestRun?.total ??
        assignedContacts;

      const dispatchProcessed =
        latestRun?.processed ??
        0;

      const dispatchAccepted =
        latestRun?.successful ??
        0;

      const dispatchFailed =
        latestRun?.failed ??
        0;

      const dispatchRemaining =
        Math.max(
          dispatchTotal -
            dispatchProcessed,
          0
        );

      //------------------------------------------------
      // Historical Attempt Metrics
      //------------------------------------------------

      const historicalTotalAttempts =
        sumStatusGroups(
          historicalStatusGroups
        );

      const historicalAnsweredAttempts =
        historicalCounts[
          CallStatus.ANSWERED
        ] +
        historicalCounts[
          CallStatus.COMPLETED
        ];

      const historicalUnsuccessfulAttempts =
        historicalCounts[
          CallStatus.FAILED
        ] +
        historicalCounts[
          CallStatus.BUSY
        ] +
        historicalCounts[
          CallStatus.NO_ANSWER
        ] +
        historicalCounts[
          CallStatus.CANCELED
        ];

      //------------------------------------------------
      // Rates
      //------------------------------------------------

      const contactCoverageRate =
        calculatePercentage(
          processedContacts,
          assignedContacts
        );

      const contactCompletionRate =
        calculatePercentage(
          completedContacts,
          processedContacts
        );

      const contactUnsuccessfulRate =
        calculatePercentage(
          totalUnsuccessfulContacts,
          processedContacts
        );

      const attemptAnswerRate =
        calculatePercentage(
          latestAnsweredAttempts,
          latestTotalAttempts
        );

      const attemptCompletionRate =
        calculatePercentage(
          latestCompletedAttempts,
          latestTotalAttempts
        );

      const attemptUnsuccessfulRate =
        calculatePercentage(
          latestUnsuccessfulAttempts,
          latestTotalAttempts
        );

      const latestRunProgress =
        latestRun
          ? calculatePercentage(
              latestRun.processed,
              latestRun.total
            )
          : 0;

      //------------------------------------------------
      // Current Attempt Metrics Object
      //------------------------------------------------

      const currentRunAttempts = {
        total:
          latestTotalAttempts,

        initial:
          latestInitialAttempts,

        retries:
          latestRetryAttempts,

        active:
          latestActiveAttempts,

        queued:
          latestQueuedAttempts,

        ringing:
          latestRingingAttempts,

        currentlyAnswered:
          latestCurrentlyAnsweredAttempts,

        answered:
          latestAnsweredAttempts,

        completed:
          latestCompletedAttempts,

        unsuccessful:
          latestUnsuccessfulAttempts,

        failed:
          latestFailedAttempts,

        busy:
          latestBusyAttempts,

        noAnswer:
          latestNoAnswerAttempts,

        canceled:
          latestCanceledAttempts,
      };

      //------------------------------------------------
      // Historical Attempt Metrics Object
      //------------------------------------------------

      const historicalAttempts = {
        total:
          historicalTotalAttempts,

        answered:
          historicalAnsweredAttempts,

        completed:
          historicalCounts[
            CallStatus.COMPLETED
          ],

        unsuccessful:
          historicalUnsuccessfulAttempts,

        failed:
          historicalCounts[
            CallStatus.FAILED
          ],

        busy:
          historicalCounts[
            CallStatus.BUSY
          ],

        noAnswer:
          historicalCounts[
            CallStatus.NO_ANSWER
          ],

        canceled:
          historicalCounts[
            CallStatus.CANCELED
          ],
      };

      //------------------------------------------------
      // Response
      //------------------------------------------------

      return NextResponse.json({
        success:
          true,

        message:
          "Campaign statistics fetched successfully",

        data: {
          campaign: {
            id:
              campaign.id,

            name:
              campaign.name,

            description:
              campaign.description,

            language:
              campaign.language,

            voice:
              campaign.voice,

            status:
              campaign.status,

            scheduledAt:
              campaign.scheduledAt,

            startedAt:
              campaign.startedAt,

            completedAt:
              campaign.completedAt,

            createdAt:
              campaign.createdAt,

            updatedAt:
              campaign.updatedAt,
          },

          //------------------------------------------
          // Unique contact metrics
          //------------------------------------------

          contacts: {
            assigned:
              assignedContacts,

            processed:
              processedContacts,

            attempted:
              attemptedContacts,

            notAttempted:
              notAttemptedContacts,

            completed:
              completedContacts,

            active:
              activeContacts,

            awaitingRetry:
              awaitingRetryContacts,

            unsuccessful:
              unsuccessfulContacts,

            dispatchFailed:
              dispatchFailedContacts,

            totalUnsuccessful:
              totalUnsuccessfulContacts,

            accounted:
              accountedContacts,

            coverageRate:
              contactCoverageRate,
          },

          //------------------------------------------
          // Initial dispatch counters
          //------------------------------------------

          dispatch: {
            total:
              dispatchTotal,

            processed:
              dispatchProcessed,

            accepted:
              dispatchAccepted,

            failed:
              dispatchFailed,

            remaining:
              dispatchRemaining,
          },

          //------------------------------------------
          // Latest campaign run
          //------------------------------------------

          latestRun:
            latestRun
              ? {
                  id:
                    latestRun.id,

                  status:
                    latestRun.status,

                  total:
                    latestRun.total,

                  processed:
                    latestRun.processed,

                  /*
                   * Compatibility fields.
                   *
                   * successful = dispatch accepted
                   * failed     = dispatch failed
                   */
                  successful:
                    latestRun.successful,

                  failed:
                    latestRun.failed,

                  remaining:
                    dispatchRemaining,

                  progressPercentage:
                    latestRunProgress,

                  startedAt:
                    latestRun.startedAt,

                  completedAt:
                    latestRun.completedAt,

                  createdAt:
                    latestRun.createdAt,

                  updatedAt:
                    latestRun.updatedAt,
                }
              : null,

          //------------------------------------------
          // Latest-run attempt metrics
          //------------------------------------------

          currentRunAttempts,

          /*
           * Temporary backward-compatible alias.
           * Remove after all frontend consumers use
           * currentRunAttempts.
           */
          currentRunCalls:
            currentRunAttempts,

          //------------------------------------------
          // Historical attempt metrics
          //------------------------------------------

          historicalAttempts,

          /*
           * Temporary backward-compatible alias.
           */
          historicalCalls:
            historicalAttempts,

          //------------------------------------------
          // Contact and attempt rates
          //------------------------------------------

          rates: {
            contactCoverageRate,

            contactCompletionRate,

            contactUnsuccessfulRate,

            attemptAnswerRate,

            attemptCompletionRate,

            attemptUnsuccessfulRate,

            /*
             * Backward-compatible aliases.
             */
            answerRate:
              attemptAnswerRate,

            completionRate:
              attemptCompletionRate,

            unsuccessfulRate:
              attemptUnsuccessfulRate,
          },

          //------------------------------------------
          // Latest-run completed duration
          //------------------------------------------

          duration: {
            totalSeconds:
              latestRunDuration
                ._sum
                .duration ??
              0,

            averageSeconds:
              roundNumber(
                latestRunDuration
                  ._avg
                  .duration
              ),

            minimumSeconds:
              latestRunDuration
                ._min
                .duration ??
              0,

            maximumSeconds:
              latestRunDuration
                ._max
                .duration ??
              0,
          },

          //------------------------------------------
          // Latest-run lifecycle
          //------------------------------------------

          lifecycle: {
            firstRequestedAt:
              latestRunLifecycle
                ._min
                .requestedAt,

            lastRequestedAt:
              latestRunLifecycle
                ._max
                .requestedAt,

            firstQueuedAt:
              latestRunLifecycle
                ._min
                .queuedAt,

            lastQueuedAt:
              latestRunLifecycle
                ._max
                .queuedAt,

            firstRingingAt:
              latestRunLifecycle
                ._min
                .ringingAt,

            lastRingingAt:
              latestRunLifecycle
                ._max
                .ringingAt,

            firstAnsweredAt:
              latestRunLifecycle
                ._min
                .answeredAt,

            lastAnsweredAt:
              latestRunLifecycle
                ._max
                .answeredAt,

            firstCompletedAt:
              latestRunLifecycle
                ._min
                .completedAt,

            lastCompletedAt:
              latestRunLifecycle
                ._max
                .completedAt,
          },

          //------------------------------------------
          // Historical duration
          //------------------------------------------

          historicalDuration: {
            totalSeconds:
              historicalDuration
                ._sum
                .duration ??
              0,

            averageSeconds:
              roundNumber(
                historicalDuration
                  ._avg
                  .duration
              ),

            minimumSeconds:
              historicalDuration
                ._min
                .duration ??
              0,

            maximumSeconds:
              historicalDuration
                ._max
                .duration ??
              0,
          },
        },
      });
    }
  );

//--------------------------------------------------
// Latest Attempt Per Contact
//--------------------------------------------------

function buildLatestCallByContact(
  calls: LatestRunCall[]
): Map<
  string,
  LatestRunCall
> {
  const latestByContact =
    new Map<
      string,
      LatestRunCall
    >();

  for (
    const call of
    calls
  ) {
    const existing =
      latestByContact.get(
        call.contactId
      );

    if (
      !existing
    ) {
      latestByContact.set(
        call.contactId,
        call
      );

      continue;
    }

    if (
      call.attemptNumber >
      existing.attemptNumber
    ) {
      latestByContact.set(
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
      latestByContact.set(
        call.contactId,
        call
      );
    }
  }

  return latestByContact;
}

//--------------------------------------------------
// Active Call Status
//--------------------------------------------------

function isActiveCallStatus(
  status: CallStatus
): boolean {
  return (
    status ===
      CallStatus.QUEUED ||
    status ===
      CallStatus.RINGING ||
    status ===
      CallStatus.ANSWERED
  );
}

//--------------------------------------------------
// Terminal Call Status
//--------------------------------------------------

function isTerminalCallStatus(
  status: CallStatus
): boolean {
  return (
    status ===
      CallStatus.COMPLETED ||
    status ===
      CallStatus.FAILED ||
    status ===
      CallStatus.BUSY ||
    status ===
      CallStatus.NO_ANSWER ||
    status ===
      CallStatus.CANCELED
  );
}

//--------------------------------------------------
// Status Counts
//--------------------------------------------------

function buildStatusCounts(
  groups: Array<{
    status: CallStatus;

    _count: {
      _all: number;
    };
  }>
): Record<
  CallStatus,
  number
> {
  const counts:
    Record<
      CallStatus,
      number
    > = {
      [CallStatus.QUEUED]:
        0,

      [CallStatus.RINGING]:
        0,

      [CallStatus.ANSWERED]:
        0,

      [CallStatus.COMPLETED]:
        0,

      [CallStatus.FAILED]:
        0,

      [CallStatus.BUSY]:
        0,

      [CallStatus.NO_ANSWER]:
        0,

      [CallStatus.CANCELED]:
        0,
    };

  for (
    const group of
    groups
  ) {
    counts[
      group.status
    ] =
      group._count._all;
  }

  return counts;
}

//--------------------------------------------------
// Sum Status Groups
//--------------------------------------------------

function sumStatusGroups(
  groups: Array<{
    _count: {
      _all: number;
    };
  }>
): number {
  return groups.reduce(
    (
      total,
      group
    ) =>
      total +
      group._count._all,
    0
  );
}

//--------------------------------------------------
// Percentage
//--------------------------------------------------

function calculatePercentage(
  value: number,
  total: number
): number {
  if (
    total <=
    0
  ) {
    return 0;
  }

  return Number(
    (
      (
        value /
        total
      ) *
      100
    ).toFixed(
      2
    )
  );
}

//--------------------------------------------------
// Round Number
//--------------------------------------------------

function roundNumber(
  value:
    | number
    | null
): number {
  if (
    value ===
    null
  ) {
    return 0;
  }

  return Number(
    value.toFixed(
      2
    )
  );
}