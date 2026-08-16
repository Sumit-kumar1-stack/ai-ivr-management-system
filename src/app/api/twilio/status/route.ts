import {
  CallStatus,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  createCallLogger,
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";

import {
  cleanupCallRuntime,
} from "@/services/calls/call-runtime-cleanup.service";

import {
  clearHumanTransferState,
} from "@/services/telephony/human-transfer-lifecycle.service";

import {
  updateCallStatus,
  type UpdateCallStatusResult,
} from "@/services/calls/call.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "twilio-status-route"
  );

//--------------------------------------------------
// Twilio Status Callback
//--------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    //----------------------------------------
    // Validate Twilio Signature And Body
    //----------------------------------------

    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    //----------------------------------------
    // Resolve Internal Call ID
    //----------------------------------------

    const internalCallId =
      request.nextUrl
        .searchParams
        .get(
          "callId"
        )
        ?.trim() ||
      undefined;

    //----------------------------------------
    // Resolve Twilio Callback Values
    //----------------------------------------

    const providerCallId =
      String(
        params.CallSid ??
          ""
      ).trim();

    const providerStatus =
      String(
        params.CallStatus ??
          ""
      ).trim();

    const durationValue =
      String(
        params.CallDuration ??
          ""
      ).trim();

    //----------------------------------------
    // Validate Required Fields
    //----------------------------------------

    if (
      !providerCallId ||
      !providerStatus
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.status.rejected",

          reason:
            "missing_required_fields",

          providerCallIdPresent:
            Boolean(
              providerCallId
            ),

          providerStatusPresent:
            Boolean(
              providerStatus
            ),

          internalCallIdPresent:
            Boolean(
              internalCallId
            ),
        },
        "Twilio status callback rejected"
      );

      return NextResponse.json(
        {
          success:
            false,

          message:
            "CallSid and CallStatus are required",
        },
        {
          status:
            400,
        }
      );
    }

    //----------------------------------------
    // Parse Duration Safely
    //----------------------------------------

    const parsedDuration =
      durationValue
        ? Number(
            durationValue
          )
        : undefined;

    const duration =
      parsedDuration !==
        undefined &&
      Number.isFinite(
        parsedDuration
      ) &&
      parsedDuration >=
        0
        ? Math.floor(
            parsedDuration
          )
        : undefined;

    //----------------------------------------
    // Log Incoming Callback
    //----------------------------------------

    serviceLog.info(
      {
        event:
          "twilio.status.received",

        internalCallIdPresent:
          Boolean(
            internalCallId
          ),

        providerCallIdPresent:
          true,

        providerStatusPresent:
          true,

        durationPresent:
          duration !==
          undefined,

        durationSeconds:
          duration ??
          null,
      },
      "Twilio status callback received"
    );

    //----------------------------------------
    // Update Internal Call Lifecycle
    //----------------------------------------

    const result =
      await updateCallStatus({
        callId:
          internalCallId,

        providerCallId,

        status:
          providerStatus,

        duration,
      });

    //----------------------------------------
    // Handle Unmatched Callback
    //----------------------------------------

    if (
      result.count ===
        0 ||
      !result.callId
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.status.unmatched",

          internalCallIdPresent:
            Boolean(
              internalCallId
            ),

          providerCallIdPresent:
            true,

          providerStatusPresent:
            true,
        },
        "Twilio status callback did not match an internal call"
      );

      /*
       * Return HTTP 200 so Twilio does not keep
       * retrying an unmatched but valid callback.
       */
      return NextResponse.json({
        success:
          true,

        matched:
          false,

        ignored:
          true,

        duplicate:
          false,

        terminalCleanup:
          false,

        eventPublished:
          false,
      });
    }

    //----------------------------------------
    // Call Logger
    //----------------------------------------

    const log =
      createCallLogger(
        result.callId
      );

    //----------------------------------------
    // Publish Lifecycle Event
    //----------------------------------------

    const eventPublished =
      await publishLifecycleEvent(
        result
      );

    //----------------------------------------
    // Terminal Runtime Cleanup
    //----------------------------------------

    const terminalCleanup =
      await handleTerminalCleanup(
        result
      );

    //----------------------------------------
    // Final Lifecycle Log
    //----------------------------------------

    log.info(
      {
        event:
          "twilio.status.updated",

        previousStatus:
          result.previousStatus,

        currentStatus:
          result.status,

        duplicate:
          result.duplicate ??
          false,

        ignored:
          result.ignored ??
          false,

        terminalTransition:
          result.terminalTransition ??
          false,

        terminalCleanup,

        retryScheduled:
          result.retryScheduled ??
          false,

        eventPublished,
      },
      "Internal call status updated"
    );

    //----------------------------------------
    // Response
    //----------------------------------------

    return NextResponse.json({
      success:
        true,

      matched:
        true,

      ignored:
        result.ignored ??
        false,

      duplicate:
        result.duplicate ??
        false,

      terminalTransition:
        result.terminalTransition ??
        false,

      terminalCleanup,

      retryScheduled:
        result.retryScheduled ??
        false,

      eventPublished,
    });
  } catch (
    error
  ) {
    //----------------------------------------
    // Twilio Authentication Error
    //----------------------------------------

    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    //----------------------------------------
    // Generic Processing Error
    //----------------------------------------

    serviceLog.error(
      {
        event:
          "twilio.status.failed",

        error:
          normalizeError(
            error
          ),
      },
      "Twilio status callback failed"
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Failed to process status callback",
      },
      {
        status:
          500,
      }
    );
  }
}

//--------------------------------------------------
// Terminal Runtime Cleanup
//--------------------------------------------------

async function handleTerminalCleanup(
  result: UpdateCallStatusResult
): Promise<boolean> {
  const callId =
    result.callId;

  /*
   * Cleanup only when the database lifecycle
   * actually transitioned into a terminal state.
   *
   * Do NOT cleanup for:
   * - unmatched callbacks
   * - duplicate callbacks
   * - ignored/out-of-order callbacks
   * - callbacks that merely repeat terminal state
   */
  if (
    !callId ||
    !result.terminalTransition ||
    result.ignored ||
    result.duplicate
  ) {
    return false;
  }

  const log =
    createCallLogger(
      callId
    );

try {
  //------------------------------------------------
  // Standard Call Runtime Cleanup
  //------------------------------------------------

  await cleanupCallRuntime(
    callId
  );

  //------------------------------------------------
  // Clear Human Transfer Runtime
  //------------------------------------------------

  await clearHumanTransferState(
    callId
  );

  //------------------------------------------------
  // Complete
  //------------------------------------------------

  log.info(
    {
      event:
        "twilio.status.runtime_cleanup_completed",

      status:
        result.status,

      humanTransferStateCleared:
        true,
    },
    "Terminal call runtime cleanup completed"
  );

  return true;
  } catch (
    error
  ) {
    /*
     * Runtime cleanup must never make Twilio
     * consider an otherwise valid status callback
     * unsuccessful.
     *
     * cleanupCallRuntime() already performs
     * best-effort per-resource cleanup, but this
     * outer guard protects the webhook itself.
     */
    log.error(
      {
        event:
          "twilio.status.runtime_cleanup_failed",

        status:
          result.status,

        error:
          normalizeError(
            error
          ),
      },
      "Terminal call runtime cleanup failed"
    );

    return false;
  }
}

//--------------------------------------------------
// Publish Internal Lifecycle Event
//--------------------------------------------------

async function publishLifecycleEvent(
  result: UpdateCallStatusResult
): Promise<boolean> {
  const callId =
    result.callId;

  const status =
    result.status;

  /*
   * Never publish for:
   *
   * - unmatched callbacks
   * - duplicate callbacks
   * - ignored/out-of-order callbacks
   * - callbacks without a resolved status
   */
  if (
    !callId ||
    !status ||
    result.ignored ||
    result.duplicate
  ) {
    return false;
  }

  const appEvent =
    mapStatusToAppEvent(
      status
    );

  if (
    !appEvent
  ) {
    return false;
  }

  const published =
    await EventPublisher.publish(
      appEvent,
      {
        callId,

        timestamp:
          Date.now(),
      }
    );

  return published;
}

//--------------------------------------------------
// Map Database Status To Application Event
//--------------------------------------------------

function mapStatusToAppEvent(
  status: CallStatus
): AppEvent | null {
  switch (
    status
  ) {
    //----------------------------------------
    // Started
    //----------------------------------------

    case CallStatus.QUEUED:
      return AppEvent.CALL_STARTED;

    //----------------------------------------
    // Ringing
    //----------------------------------------

    case CallStatus.RINGING:
      return AppEvent.CALL_RINGING;

    //----------------------------------------
    // Answered
    //----------------------------------------

    case CallStatus.ANSWERED:
      return AppEvent.CALL_ANSWERED;

    //----------------------------------------
    // Successfully Completed
    //----------------------------------------

    case CallStatus.COMPLETED:
      return AppEvent.CALL_COMPLETED;

    //----------------------------------------
    // Terminal Failure
    //----------------------------------------

    case CallStatus.FAILED:
    case CallStatus.BUSY:
    case CallStatus.NO_ANSWER:
    case CallStatus.CANCELED:
      return AppEvent.CALL_FAILED;

    //----------------------------------------
    // No Realtime Dashboard Event
    //----------------------------------------

    default:
      return null;
  }
}

//--------------------------------------------------
// Reject GET Requests
//--------------------------------------------------

export async function GET():
  Promise<NextResponse> {
  return NextResponse.json(
    {
      success:
        false,

      message:
        "Method not allowed",
    },
    {
      status:
        405,

      headers: {
        Allow:
          "POST",

        "Cache-Control":
          "no-store",
      },
    }
  );
}