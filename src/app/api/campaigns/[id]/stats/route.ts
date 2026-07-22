import {
  CallStatus,
  CampaignRunStatus,
  CampaignStatus,
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
// Campaign Statistics
//--------------------------------------------------

export const GET =
  asyncHandler<RouteContext>(
    async (
      _request:
        NextRequest,

      context:
        RouteContext
    ): Promise<NextResponse> => {

      //----------------------------------------
      // Authorization
      //----------------------------------------

      await requireRole([
        "AGENT",
        "ADMIN",
        "SUPER_ADMIN",
      ]);


      //----------------------------------------
      // Read Campaign ID
      //----------------------------------------

      const {
        id:
          campaignId,
      } = await context.params;


      //----------------------------------------
      // Confirm Campaign Exists
      //----------------------------------------

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


      //----------------------------------------
      // Fetch Campaign-Specific Aggregates
      //----------------------------------------

      const [
        statusGroups,
        assignedContacts,
        latestRun,
        durationAggregate,
        lifecycleAggregate,
      ] = await Promise.all([

        //--------------------------------------
        // Call outcome counts
        //--------------------------------------

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


        //--------------------------------------
        // Assigned campaign contacts
        //--------------------------------------

        prisma.campaignContact.count({
          where: {
            campaignId,
          },
        }),


        //--------------------------------------
        // Latest campaign run
        //--------------------------------------

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


        //--------------------------------------
        // Completed-call duration
        //--------------------------------------

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

          _max: {
            duration:
              true,
          },

          _min: {
            duration:
              true,
          },
        }),


        //--------------------------------------
        // Lifecycle timestamps
        //--------------------------------------

        prisma.call.aggregate({
          where: {
            campaignId,
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
      ]);


      //----------------------------------------
      // Initialize Every Call Status
      //----------------------------------------

      const statusCounts:
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


      //----------------------------------------
      // Populate Grouped Results
      //----------------------------------------

      for (
        const group of
        statusGroups
      ) {

        statusCounts[
          group.status
        ] =
          group._count._all;

      }


      //----------------------------------------
      // Calculate Call Totals
      //----------------------------------------

      const totalCalls =
        statusGroups.reduce(
          (
            total,
            group
          ) =>
            total +
            group._count._all,
          0
        );


      const queuedCalls =
        statusCounts[
          CallStatus.QUEUED
        ];


      const ringingCalls =
        statusCounts[
          CallStatus.RINGING
        ];


      const currentlyAnsweredCalls =
        statusCounts[
          CallStatus.ANSWERED
        ];


      const completedCalls =
        statusCounts[
          CallStatus.COMPLETED
        ];


      /*
       * A completed call must previously have
       * reached the answered/in-progress state.
       */
      const everAnsweredCalls =
        currentlyAnsweredCalls +
        completedCalls;


      const failedCalls =
        statusCounts[
          CallStatus.FAILED
        ];


      const busyCalls =
        statusCounts[
          CallStatus.BUSY
        ];


      const noAnswerCalls =
        statusCounts[
          CallStatus.NO_ANSWER
        ];


      const canceledCalls =
        statusCounts[
          CallStatus.CANCELED
        ];


      const unsuccessfulCalls =
        failedCalls +
        busyCalls +
        noAnswerCalls +
        canceledCalls;


      const activeCalls =
        queuedCalls +
        ringingCalls +
        currentlyAnsweredCalls;


      //----------------------------------------
      // Calculate Rates
      //----------------------------------------

      const answerRate =
        calculatePercentage(
          everAnsweredCalls,
          totalCalls
        );


      const completionRate =
        calculatePercentage(
          completedCalls,
          totalCalls
        );


      const unsuccessfulRate =
        calculatePercentage(
          unsuccessfulCalls,
          totalCalls
        );


      const contactCoverageRate =
        calculatePercentage(
          totalCalls,
          assignedContacts
        );


      //----------------------------------------
      // Latest Run Progress
      //----------------------------------------

      const latestRunProgress =
        latestRun
          ? calculatePercentage(
              latestRun.processed,
              latestRun.total
            )
          : 0;


      //----------------------------------------
      // Return Statistics
      //----------------------------------------

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


          contacts: {
            assigned:
              assignedContacts,

            attempted:
              totalCalls,

            notAttempted:
              Math.max(
                assignedContacts -
                totalCalls,
                0
              ),

            coverageRate:
              contactCoverageRate,
          },


          calls: {
            total:
              totalCalls,

            active:
              activeCalls,

            queued:
              queuedCalls,

            ringing:
              ringingCalls,

            currentlyAnswered:
              currentlyAnsweredCalls,

            everAnswered:
              everAnsweredCalls,

            completed:
              completedCalls,

            unsuccessful:
              unsuccessfulCalls,

            failed:
              failedCalls,

            busy:
              busyCalls,

            noAnswer:
              noAnswerCalls,

            canceled:
              canceledCalls,
          },


          rates: {
            answerRate,

            completionRate,

            unsuccessfulRate,

            contactCoverageRate,
          },


          duration: {
            totalSeconds:
              durationAggregate
                ._sum
                .duration ??
              0,

            averageSeconds:
              roundNumber(
                durationAggregate
                  ._avg
                  .duration
              ),

            minimumSeconds:
              durationAggregate
                ._min
                .duration ??
              0,

            maximumSeconds:
              durationAggregate
                ._max
                .duration ??
              0,
          },


          lifecycle: {
            firstRequestedAt:
              lifecycleAggregate
                ._min
                .requestedAt,

            lastRequestedAt:
              lifecycleAggregate
                ._max
                .requestedAt,

            firstQueuedAt:
              lifecycleAggregate
                ._min
                .queuedAt,

            lastQueuedAt:
              lifecycleAggregate
                ._max
                .queuedAt,

            firstRingingAt:
              lifecycleAggregate
                ._min
                .ringingAt,

            lastRingingAt:
              lifecycleAggregate
                ._max
                .ringingAt,

            firstAnsweredAt:
              lifecycleAggregate
                ._min
                .answeredAt,

            lastAnsweredAt:
              lifecycleAggregate
                ._max
                .answeredAt,

            firstCompletedAt:
              lifecycleAggregate
                ._min
                .completedAt,

            lastCompletedAt:
              lifecycleAggregate
                ._max
                .completedAt,
          },


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

                  successful:
                    latestRun.successful,

                  failed:
                    latestRun.failed,

                  remaining:
                    Math.max(
                      latestRun.total -
                      latestRun.processed,
                      0
                    ),

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
        },
      });

    }
  );


//--------------------------------------------------
// Percentage Helper
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
      value /
      total *
      100
    ).toFixed(
      2
    )
  );

}


//--------------------------------------------------
// Round Nullable Number
//--------------------------------------------------

function roundNumber(
  value:
    number |
    null
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