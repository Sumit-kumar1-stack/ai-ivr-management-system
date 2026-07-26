import {
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


const CALL_DETAILS_ROLES:
  readonly UserRole[] = [
    UserRole.AGENT,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ];


type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};


export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {

    //----------------------------------------
    // Authorization
    //----------------------------------------

    await requireRole(
      CALL_DETAILS_ROLES
    );


    //----------------------------------------
    // Read And Validate Call ID
    //----------------------------------------

    const {
      id,
    } =
      await context.params;


    const callId =
      id.trim();


    if (
      !callId
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Call ID is required",
        },
        {
          status:
            400,
        }
      );
    }


    //----------------------------------------
    // Load Call Details
    //----------------------------------------

    const call =
      await prisma.call.findUnique({
        where: {
          id:
            callId,
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

              createdAt:
                true,
            },
          },

          campaign: {
            select: {
              id:
                true,

              name:
                true,

              description:
                true,

              language:
                true,

              status:
                true,

              createdAt:
                true,

              completedAt:
                true,
            },
          },

          campaignRun: {
            select: {
              id:
                true,

              status:
                true,

              startedAt:
                true,

              completedAt:
                true,

              createdAt:
                true,
            },
          },

          conversation: {
            include: {
              messages: {
                orderBy: {
                  createdAt:
                    "asc",
                },
              },
            },
          },

          events: {
            orderBy: {
              createdAt:
                "asc",
            },
          },

          retryOfCall: {
            select: {
              id:
                true,

              status:
                true,

              attemptNumber:
                true,

              retryReason:
                true,

              nextRetryAt:
                true,

              requestedAt:
                true,

              completedAt:
                true,

              failedAt:
                true,
            },
          },

          retryAttempts: {
            orderBy: [
              {
                attemptNumber:
                  "asc",
              },
              {
                createdAt:
                  "asc",
              },
            ],

            select: {
              id:
                true,

              status:
                true,

              attemptNumber:
                true,

              maxAttempts:
                true,

              retryReason:
                true,

              nextRetryAt:
                true,

              providerCallId:
                true,

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

              failedAt:
                true,

              duration:
                true,

              createdAt:
                true,
            },
          },
        },
      });


    if (
      !call
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Call not found",
        },
        {
          status:
            404,
        }
      );
    }


    //----------------------------------------
    // Resolve Duration
    //----------------------------------------

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


    //----------------------------------------
    // Return Safe Response
    //----------------------------------------

    return NextResponse.json({
      success:
        true,

      data: {
        id:
          call.id,

        providerCallId:
          call.providerCallId,

        status:
          call.status,

        language:
          call.language,

        duration,

        hasRecording:
          Boolean(
            call.recordingUrl
          ),

        transcript:
          call.transcript,

        summary:
          call.summary,

        attempt: {
          number:
            call.attemptNumber,

          maximum:
            call.maxAttempts,

          isRetry:
            call.attemptNumber >
            1,

          retryReason:
            call.retryReason,

          nextRetryAt:
            call.nextRetryAt,

          retryOfCallId:
            call.retryOfCallId,

          retriesCreated:
            call.retryAttempts.length,
        },

        phone: {
          contactPhoneSnapshot:
            call.contactPhoneSnapshot,

          providerDestination:
            call.providerDestination,

          usedDevelopmentOverride:
            call.usedDevelopmentOverride,

          destinationOverrideSource:
            call.destinationOverrideSource,
        },

        lifecycle: {
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
        },

        contact:
          call.contact,

        campaign:
          call.campaign,

        campaignRun:
          call.campaignRun,

        retryHistory: {
          previousAttempt:
            call.retryOfCall
              ? {
                  id:
                    call.retryOfCall.id,

                  status:
                    call.retryOfCall.status,

                  attemptNumber:
                    call.retryOfCall.attemptNumber,

                  retryReason:
                    call.retryOfCall.retryReason,

                  nextRetryAt:
                    call.retryOfCall.nextRetryAt,

                  requestedAt:
                    call.retryOfCall.requestedAt,

                  completedAt:
                    call.retryOfCall.completedAt,

                  failedAt:
                    call.retryOfCall.failedAt,
                }
              : null,

          followingAttempts:
            call.retryAttempts.map(
              retry => ({
                id:
                  retry.id,

                status:
                  retry.status,

                attemptNumber:
                  retry.attemptNumber,

                maximumAttempts:
                  retry.maxAttempts,

                retryReason:
                  retry.retryReason,

                nextRetryAt:
                  retry.nextRetryAt,

                providerCallId:
                  retry.providerCallId,

                duration:
                  retry.duration,

                lifecycle: {
                  requestedAt:
                    retry.requestedAt,

                  queuedAt:
                    retry.queuedAt,

                  ringingAt:
                    retry.ringingAt,

                  answeredAt:
                    retry.answeredAt,

                  completedAt:
                    retry.completedAt,

                  failedAt:
                    retry.failedAt,

                  createdAt:
                    retry.createdAt,
                },
              })
            ),
        },

        conversation:
          call.conversation
            ? {
                id:
                  call.conversation.id,

                summary:
                  call.conversation.summary,

                intent:
                  call.conversation.intent,

                sentiment:
                  call.conversation.sentiment,

                priority:
                  call.conversation.priority,

                followUp:
                  call.conversation.followUp,

                actionItems:
                  call.conversation.actionItems,

                tokenUsage:
                  call.conversation.tokenUsage,

                createdAt:
                  call.conversation.createdAt,

                updatedAt:
                  call.conversation.updatedAt,

                messages:
                  call.conversation.messages.map(
                    message => ({
                      id:
                        message.id,

                      role:
                        message.role,

                      content:
                        message.content,

                      createdAt:
                        message.createdAt,
                    })
                  ),
              }
            : null,

        timeline:
          call.events.map(
            event => ({
              id:
                event.id,

              type:
                event.type,

              message:
                event.message,

              payload:
                event.payload,

              metadata:
                event.metadata,

              createdAt:
                event.createdAt,
            })
          ),
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
      "Failed to fetch call details",
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
          "Failed to fetch call details",
      },
      {
        status:
          500,
      }
    );
  }
}