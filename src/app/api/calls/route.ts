import {
  CallStatus,
  Prisma,
  UserRole,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireRole,
  isAuthenticationError,
  isAuthorizationError,
} from "@/lib/auth";

import {
  prisma,
} from "@/lib/prisma";

import {
  normalizeRecordingStatus,
} from "@/services/telephony/plivo-recording.service";


const CALL_LIST_ROLES:
  readonly UserRole[] = [
    UserRole.AGENT,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ];


const DEFAULT_PAGE =
  1;

const DEFAULT_LIMIT =
  10;

const MAX_LIMIT =
  100;


//--------------------------------------------------
// Parse Positive Integer
//--------------------------------------------------

function parsePositiveInteger(
  value: string | null,
  fallback: number
): number {
  if (
    !value
  ) {
    return fallback;
  }


  const parsed =
    Number.parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      1
  ) {
    return fallback;
  }


  return parsed;
}


//--------------------------------------------------
// Validate Call Status
//--------------------------------------------------

function isCallStatus(
  value: string
): value is CallStatus {
  return Object.values(
    CallStatus
  ).includes(
    value as CallStatus
  );
}


//--------------------------------------------------
// Get Calls
//--------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {

    //----------------------------------------
    // Authorization
    //----------------------------------------

    await requireRole(
      CALL_LIST_ROLES
    );


    //----------------------------------------
    // Read Query Parameters
    //----------------------------------------

    const {
      searchParams,
    } =
      request.nextUrl;


    const page =
      parsePositiveInteger(
        searchParams.get(
          "page"
        ),
        DEFAULT_PAGE
      );


    const requestedLimit =
      parsePositiveInteger(
        searchParams.get(
          "limit"
        ),
        DEFAULT_LIMIT
      );


    const limit =
      Math.min(
        requestedLimit,
        MAX_LIMIT
      );


    const search =
      searchParams
        .get(
          "search"
        )
        ?.trim() ??
      "";


    const statusParameter =
      searchParams
        .get(
          "status"
        )
        ?.trim()
        .toUpperCase() ??
      "";


    const campaignId =
      searchParams
        .get(
          "campaignId"
        )
        ?.trim() ??
      "";

    const hasRecordingParameter =
      searchParams
        .get(
          "hasRecording"
        )
        ?.trim()
        .toLowerCase() ??
      "";

    const recordingStatusParameter =
      searchParams
        .get(
          "recordingStatus"
        )
        ?.trim()
        .toUpperCase() ??
      "";

    const dateFrom =
      searchParams
        .get(
          "dateFrom"
        )
        ?.trim() ??
      "";


    const dateTo =
      searchParams
        .get(
          "dateTo"
        )
        ?.trim() ??
      "";


    //----------------------------------------
    // Validate Call Status
    //----------------------------------------

    if (
      statusParameter &&
      !isCallStatus(
        statusParameter
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Invalid call status",

          allowedStatuses:
            Object.values(
              CallStatus
            ),
        },
        {
          status:
            400,
        }
      );
    }


    //----------------------------------------
    // Build Filters
    //----------------------------------------

    const filters:
      Prisma.CallWhereInput[] =
      [];


    if (
      search
    ) {
      filters.push({
        OR: [
          {
            id: {
              contains:
                search,

              mode:
                "insensitive",
            },
          },

          {
            providerCallId: {
              contains:
                search,

              mode:
                "insensitive",
            },
          },

          {
            contactPhoneSnapshot: {
              contains:
                search,

              mode:
                "insensitive",
            },
          },

          {
            providerDestination: {
              contains:
                search,

              mode:
                "insensitive",
            },
          },

          {
            contact: {
              is: {
                fullName: {
                  contains:
                    search,

                  mode:
                    "insensitive",
                },
              },
            },
          },

          {
            contact: {
              is: {
                phone: {
                  contains:
                    search,

                  mode:
                    "insensitive",
                },
              },
            },
          },

          {
            campaign: {
              is: {
                name: {
                  contains:
                    search,

                  mode:
                    "insensitive",
                },
              },
            },
          },
        ],
      });
    }


    if (
      statusParameter &&
      isCallStatus(
        statusParameter
      )
    ) {
      filters.push({
        status:
          statusParameter,
      });
    }


    if (
      campaignId
    ) {
      filters.push({
        campaignId,
      });
    }

    if (hasRecordingParameter === "true") {
      filters.push({
        OR: [
          { recordingUrl: { not: null } },
          { recordingStatus: { in: ["REQUESTED", "STARTED", "AVAILABLE", "FAILED"] } },
        ],
      });
    }

    if (recordingStatusParameter) {
      if (recordingStatusParameter === "AVAILABLE") {
        filters.push({
          OR: [
            { recordingStatus: "AVAILABLE" },
            { recordingUrl: { not: null } },
          ],
        });
      } else if (recordingStatusParameter === "NOT_STARTED") {
        filters.push({
          AND: [
            { recordingStatus: null },
            { recordingUrl: null },
          ],
        });
      } else {
        filters.push({
          recordingStatus: recordingStatusParameter,
        });
      }
    }


    //----------------------------------------
    // Date Filters
    //----------------------------------------

    const requestedAtFilter:
      Prisma.DateTimeFilter =
      {};


    if (
      dateFrom
    ) {
      const parsedDate =
        new Date(
          dateFrom
        );


      if (
        Number.isNaN(
          parsedDate.getTime()
        )
      ) {
        return NextResponse.json(
          {
            success:
              false,

            message:
              "Invalid dateFrom value",
          },
          {
            status:
              400,
          }
        );
      }


      requestedAtFilter.gte =
        parsedDate;
    }


    if (
      dateTo
    ) {
      const parsedDate =
        new Date(
          dateTo
        );


      if (
        Number.isNaN(
          parsedDate.getTime()
        )
      ) {
        return NextResponse.json(
          {
            success:
              false,

            message:
              "Invalid dateTo value",
          },
          {
            status:
              400,
          }
        );
      }


      /*
       * Make a date-only value inclusive through
       * the end of the selected day.
       */
      if (
        /^\d{4}-\d{2}-\d{2}$/.test(
          dateTo
        )
      ) {
        parsedDate.setHours(
          23,
          59,
          59,
          999
        );
      }


      requestedAtFilter.lte =
        parsedDate;
    }


    if (
      Object.keys(
        requestedAtFilter
      ).length >
      0
    ) {
      filters.push({
        requestedAt:
          requestedAtFilter,
      });
    }


    const where:
      Prisma.CallWhereInput =
      filters.length >
      0
        ? {
            AND:
              filters,
          }
        : {};


    //----------------------------------------
    // Query Calls And Total Count
    //----------------------------------------

    const skip =
      (
        page -
        1
      ) *
      limit;


    const [
      calls,
      total,
    ] =
      await prisma.$transaction([
        prisma.call.findMany({
          where,

          skip,

          take:
            limit,

          orderBy: {
            requestedAt:
              "desc",
          },

          include: {
            contact: {
              select: {
                id:
                  true,

                fullName:
                  true,

                phone:
                  true,

                language:
                  true,

                status:
                  true,
              },
            },

            campaign: {
              select: {
                id:
                  true,

                name:
                  true,

                status:
                  true,

                language:
                  true,
              },
            },

            campaignRun: {
              select: {
                id:
                  true,

                status:
                  true,
              },
            },

            conversation: {
              select: {
                intent:
                  true,

                sentiment:
                  true,

                priority:
                  true,

                followUp:
                  true,
              },
            },
          },
        }),

        prisma.call.count({
          where,
        }),
      ]);


    //----------------------------------------
    // Normalize Result
    //----------------------------------------

    const data =
      calls.map(
        call => {
          const duration =
            call.duration ??
            (
              call.startedAt &&
              call.endedAt
                ? Math.max(
                    0,
                    Math.floor(
                      (
                        call.endedAt.getTime() -
                        call.startedAt.getTime()
                      ) /
                        1000
                    )
                  )
                : null
            );


          return {
            id:
              call.id,

            providerCallId:
              call.providerCallId,

            status:
              call.status,

            direction:
              call.direction,

            provider:
              call.provider,

            language:
              call.language,

            duration,

            /*
             * Do not expose the provider recording URL
             * directly to the browser.
             */
            hasRecording:
              Boolean(
                call.recordingUrl
              ),

            recordingStatus:
              normalizeRecordingStatus(
                call.recordingStatus,
                Boolean(call.recordingUrl)
              ),

            recordingAvailableAt:
              call.recordingAvailableAt,

            requestedRuntime:
              call.requestedRuntime,

            effectiveRuntime:
              call.effectiveRuntime,

            summary:
              call.summary,

            contactPhoneSnapshot:
              call.contactPhoneSnapshot,

            providerDestination:
              call.providerDestination,

            usedDevelopmentOverride:
              call.usedDevelopmentOverride,

            requestedAt:
              call.requestedAt,

            queuedAt:
              call.queuedAt,

            ringingAt:
              call.ringingAt,

            answeredAt:
              call.answeredAt,

            completedAt:
              call.completedAt,

            failedAt:
              call.failedAt,

            startedAt:
              call.startedAt,

            endedAt:
              call.endedAt,

            createdAt:
              call.createdAt,

            updatedAt:
              call.updatedAt,

            contact:
              call.contact,

            campaign:
              call.campaign,

            campaignRun:
              call.campaignRun,

            analysis:
              call.conversation
                ? {
                    intent:
                      call.conversation.intent,

                    sentiment:
                      call.conversation.sentiment,

                    priority:
                      call.conversation.priority,

                    followUp:
                      call.conversation.followUp,
                  }
                : null,
          };
        }
      );


    const totalPages =
      total ===
      0
        ? 0
        : Math.ceil(
            total /
              limit
          );


    return NextResponse.json({
      success:
        true,

      data,

      meta: {
        page,

        limit,

        total,

        totalPages,

        hasPreviousPage:
          page >
          1,

        hasNextPage:
          page <
          totalPages,
      },

      filters: {
        search:
          search ||
          null,

        status:
          statusParameter ||
          null,

        campaignId:
          campaignId ||
          null,

        hasRecording:
          hasRecordingParameter === "true",

        recordingStatus:
          recordingStatusParameter ||
          null,

        dateFrom:
          dateFrom ||
          null,

        dateTo:
          dateTo ||
          null,
      },
    });

  } catch (
    error:
      unknown
  ) {

    //----------------------------------------
    // Authentication Error
    //----------------------------------------

    if (
      isAuthenticationError(
        error
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            error.message,
        },
        {
          status:
            401,
        }
      );
    }


    //----------------------------------------
    // Authorization Error
    //----------------------------------------

    if (
      isAuthorizationError(
        error
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            error.message,
        },
        {
          status:
            403,
        }
      );
    }


    //----------------------------------------
    // Unexpected Error
    //----------------------------------------

    console.error(
      "Failed to fetch calls",
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


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Failed to fetch calls",
      },
      {
        status:
          500,
      }
    );
  }
}