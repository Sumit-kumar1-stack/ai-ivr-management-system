import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCallLogger,
  createLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";

//--------------------------------------------------
// Route Logger
//--------------------------------------------------

const routeLog =
  createLogger({
    component:
      "twilio-recording-webhook",
  });

//--------------------------------------------------
// Parse Non-Negative Integer
//--------------------------------------------------

function parseNonNegativeInteger(
  value: unknown
): number | undefined {
  const normalized =
    String(
      value ??
      ""
    ).trim();

  if (
    !normalized
  ) {
    return undefined;
  }

  const parsed =
    Number(
      normalized
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      0
  ) {
    return undefined;
  }

  return Math.floor(
    parsed
  );
}

//--------------------------------------------------
// Twilio Recording Callback
//--------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  const startedAt =
    process.hrtime.bigint();

  try {
    //----------------------------------------
    // Validate Twilio Webhook Signature
    //----------------------------------------

    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    //----------------------------------------
    // Callback Parameters
    //----------------------------------------

    const internalCallId =
      request.nextUrl.searchParams
        .get(
          "callId"
        )
        ?.trim() ||
      undefined;

    const providerCallId =
      String(
        params.CallSid ??
        ""
      ).trim();

    const recordingSid =
      String(
        params.RecordingSid ??
        ""
      ).trim();

    const recordingUrl =
      String(
        params.RecordingUrl ??
        ""
      ).trim();

    const recordingStatus =
      String(
        params.RecordingStatus ??
        ""
      )
        .trim()
        .toLowerCase();

    const recordingDuration =
      parseNonNegativeInteger(
        params.RecordingDuration
      );

    const recordingChannels =
      parseNonNegativeInteger(
        params.RecordingChannels
      );

    if (
      !providerCallId ||
      !recordingStatus
    ) {
      routeLog.warn(
        {
          event:
            "twilio.recording.callback.invalid",

          internalCallId,

          providerCallId:
            providerCallId ||
            undefined,

          recordingStatus:
            recordingStatus ||
            undefined,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Twilio recording callback is missing required fields"
      );

      return NextResponse.json(
        {
          success:
            false,

          message:
            "CallSid and RecordingStatus are required",
        },
        {
          status:
            400,
        }
      );
    }

    routeLog.info(
      {
        event:
          "twilio.recording.callback.received",

        internalCallId,

        providerCallId,

        recordingSid:
          recordingSid ||
          undefined,

        recordingStatus,

        recordingDuration,

        recordingChannels,
      },
      "Twilio recording callback received"
    );

    //----------------------------------------
    // Resolve Internal Call
    //----------------------------------------

    const call =
      await prisma.call.findFirst({
        where: {
          OR: [
            ...(internalCallId
              ? [
                  {
                    id:
                      internalCallId,
                  },
                ]
              : []),

            {
              providerCallId,
            },
          ],
        },

        select: {
          id:
            true,

          campaignId:
            true,

          campaignRunId:
            true,

          contactId:
            true,

          providerCallId:
            true,

          status:
            true,

          duration:
            true,

          recordingUrl:
            true,

          attemptNumber:
            true,
        },
      });

    /*
     * Return HTTP 200 for unknown callbacks so
     * Twilio does not continuously retry.
     */
    if (
      !call
    ) {
      routeLog.warn(
        {
          event:
            "twilio.recording.callback.unmatched",

          internalCallId,

          providerCallId,

          recordingSid:
            recordingSid ||
            undefined,

          recordingStatus,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Recording callback did not match an internal call"
      );

      return NextResponse.json({
        success:
          true,

        matched:
          false,

        ignored:
          true,
      });
    }

    const log =
      createCallLogger(
        call.id,
        {
          campaignId:
            call.campaignId,

          campaignRunId:
            call.campaignRunId,

          contactId:
            call.contactId,

          providerCallId,

          attemptNumber:
            call.attemptNumber,
        }
      );

    //----------------------------------------
    // Completed Recording
    //----------------------------------------

    if (
      recordingStatus ===
      "completed"
    ) {
      if (
        !recordingUrl
      ) {
        log.warn(
          {
            event:
              "twilio.recording.completed.invalid",

            recordingSid:
              recordingSid ||
              undefined,

            durationMs:
              getDurationMs(
                startedAt
              ),
          },
          "Completed recording callback did not include RecordingUrl"
        );

        return NextResponse.json(
          {
            success:
              false,

            message:
              "RecordingUrl is required for a completed recording",
          },
          {
            status:
              400,
          }
        );
      }

      const updateResult =
        await prisma.call.updateMany({
          where: {
            id:
              call.id,
          },

          data: {
            recordingUrl,

            /*
             * Keep an existing valid duration when
             * Twilio does not send one.
             */
            ...(recordingDuration !==
            undefined
              ? {
                  duration:
                    recordingDuration,
                }
              : {}),
          },
        });

      log.info(
        {
          event:
            "twilio.recording.saved",

          recordingSid:
            recordingSid ||
            undefined,

          recordingStatus,

          recordingDuration,

          recordingChannels,

          updatedCount:
            updateResult.count,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Twilio recording metadata saved"
      );

      return NextResponse.json({
        success:
          true,

        matched:
          true,

        status:
          "completed",

        callId:
          call.id,
      });
    }

    //----------------------------------------
    // Recording Absent
    //----------------------------------------

    if (
      recordingStatus ===
      "absent"
    ) {
      log.warn(
        {
          event:
            "twilio.recording.absent",

          recordingSid:
            recordingSid ||
            undefined,

          recordingDuration,

          recordingChannels,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Twilio recording is absent"
      );

      return NextResponse.json({
        success:
          true,

        matched:
          true,

        status:
          "absent",
      });
    }

    //----------------------------------------
    // Other Recording Statuses
    //----------------------------------------

    log.info(
      {
        event:
          "twilio.recording.status.acknowledged",

        recordingSid:
          recordingSid ||
          undefined,

        recordingStatus,

        recordingDuration,

        recordingChannels,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Twilio recording status acknowledged"
    );

    return NextResponse.json({
      success:
        true,

      matched:
        true,

      status:
        recordingStatus,
    });
  } catch (
    error
  ) {
    //----------------------------------------
    // Twilio Authentication Failure
    //----------------------------------------

    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      routeLog.warn(
        {
          event:
            "twilio.recording.callback.authentication_failed",

          durationMs:
            getDurationMs(
              startedAt
            ),

          error:
            normalizeError(
              error
            ),
        },
        "Twilio recording callback authentication failed"
      );

      return authResponse;
    }

    //----------------------------------------
    // Unexpected Failure
    //----------------------------------------

    routeLog.error(
      {
        event:
          "twilio.recording.callback.failed",

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Twilio recording callback failed"
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Failed to process recording callback",
      },
      {
        status:
          500,
      }
    );
  }
}