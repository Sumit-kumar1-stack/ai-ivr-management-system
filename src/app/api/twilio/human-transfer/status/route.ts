import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  prisma,
} from "@/lib/prisma";

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
  applyHumanTransferProviderEvent,
} from "@/services/telephony/human-transfer-lifecycle.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "twilio-human-transfer-status"
  );

//--------------------------------------------------
// POST
//--------------------------------------------------

export async function POST(
  request:
    NextRequest
): Promise<NextResponse> {
  try {
    //------------------------------------------------
    // Authenticate Twilio
    //------------------------------------------------

    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    //------------------------------------------------
    // Internal Call ID
    //------------------------------------------------

    const internalCallId =
      request.nextUrl
        .searchParams
        .get(
          "callId"
        )
        ?.trim();

    if (
      !internalCallId
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.human_transfer.status_ignored",

          reason:
            "missing_internal_call_id",
        },
        "Human-transfer callback is missing internal call ID"
      );

      return successIgnored(
        "MISSING_INTERNAL_CALL_ID"
      );
    }

    const log =
      createCallLogger(
        internalCallId
      );

    //------------------------------------------------
    // Twilio Child Call
    //------------------------------------------------

    const childCallSid =
      String(
        params.CallSid ??
        ""
      ).trim();

    //------------------------------------------------
    // Twilio Parent Call
    //------------------------------------------------

    const parentCallSid =
      String(
        params.ParentCallSid ??
        ""
      ).trim();

    //------------------------------------------------
    // Provider Status
    //------------------------------------------------

    const providerStatus =
      String(
        params.CallStatus ??
        ""
      )
        .trim()
        .toLowerCase();

    //------------------------------------------------
    // Sequence
    //------------------------------------------------

    const sequenceNumber =
      parseSequenceNumber(
        params.SequenceNumber
      );

    //------------------------------------------------
    // Validate SIDs
    //------------------------------------------------

    if (
      !isTwilioCallSid(
        childCallSid
      ) ||
      !isTwilioCallSid(
        parentCallSid
      )
    ) {
      log.warn(
        {
          event:
            "twilio.human_transfer.status_ignored",

          reason:
            "invalid_call_sid",

          childCallSidPresent:
            Boolean(
              childCallSid
            ),

          parentCallSidPresent:
            Boolean(
              parentCallSid
            ),
        },
        "Human-transfer callback contained invalid Twilio call identifiers"
      );

      return successIgnored(
        "INVALID_CALL_SID"
      );
    }

    //------------------------------------------------
    // Resolve Internal Parent Call
    //------------------------------------------------

    const call =
      await prisma.call
        .findUnique({
          where: {
            id:
              internalCallId,
          },

          select: {
            id:
              true,

            providerCallId:
              true,
          },
        });

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "twilio.human_transfer.status_ignored",

          reason:
            "internal_call_not_found",
        },
        "Human-transfer callback did not match an internal call"
      );

      return successIgnored(
        "INTERNAL_CALL_NOT_FOUND"
      );
    }

    //------------------------------------------------
    // Parent Call Correlation
    //------------------------------------------------

    if (
      !call.providerCallId ||
      call.providerCallId !==
        parentCallSid
    ) {
      log.warn(
        {
          event:
            "twilio.human_transfer.status_ignored",

          reason:
            "parent_call_mismatch",

          storedParentPresent:
            Boolean(
              call.providerCallId
            ),

          callbackParentPresent:
            Boolean(
              parentCallSid
            ),
        },
        "Human-transfer callback parent does not match internal call"
      );

      return successIgnored(
        "PARENT_CALL_MISMATCH"
      );
    }

    //------------------------------------------------
    // Provider Status Mapping
    //------------------------------------------------

    const mapped =
      mapTwilioTransferStatus(
        providerStatus
      );

    if (
      !mapped
    ) {
      log.info(
        {
          event:
            "twilio.human_transfer.status_ignored",

          reason:
            "unsupported_status",

          providerStatus,

          sequenceNumber,
        },
        "Twilio human-transfer status was not actionable"
      );

      return successIgnored(
        "UNSUPPORTED_STATUS"
      );
    }

    //------------------------------------------------
    // Apply Lifecycle State
    //------------------------------------------------

    const result =
      await applyHumanTransferProviderEvent({
        callId:
          internalCallId,

        provider:
          "TWILIO",

        childProviderCallId:
          childCallSid,

        status:
          mapped.status,

        sequenceNumber,

        failureCode:
          mapped.failureCode,

        failureMessage:
          mapped.failureMessage,
      });

    //------------------------------------------------
    // Applied
    //------------------------------------------------

    if (
      result.applied
    ) {
      log.info(
        {
          event:
            "twilio.human_transfer.status_applied",

          providerStatus,

          transferStatus:
            result.state
              ?.status,

          sequenceNumber,

          childProviderCallIdPresent:
            true,
        },
        "Twilio human-transfer child-leg lifecycle updated"
      );

      return NextResponse.json({
        success:
          true,

        applied:
          true,

        ignored:
          false,

        status:
          result.state
            ?.status ??
          mapped.status,
      });
    }

    //------------------------------------------------
    // Duplicate / Stale / Invalid Transition
    //------------------------------------------------

    log.info(
      {
        event:
          "twilio.human_transfer.status_ignored",

        providerStatus,

        sequenceNumber,

        reason:
          result.reason,

        currentStatus:
          result.state
            ?.status,
      },
      "Twilio human-transfer callback was ignored"
    );

    return NextResponse.json({
      success:
        true,

      applied:
        false,

      ignored:
        true,

      reason:
        result.reason ??
        "IGNORED",
    });
  } catch (
    error
  ) {
    //------------------------------------------------
    // Authentication Error
    //------------------------------------------------

    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    //------------------------------------------------
    // Processing Error
    //------------------------------------------------

    serviceLog.error(
      {
        event:
          "twilio.human_transfer.status_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Twilio human-transfer status callback failed"
    );

    /*
     * Return 500 only for genuine processing errors.
     *
     * Twilio may retry the webhook.
     */

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Failed to process human-transfer status callback",
      },
      {
        status:
          500,
      }
    );
  }
}

//--------------------------------------------------
// Map Twilio Child-Leg Status
//--------------------------------------------------

function mapTwilioTransferStatus(
  providerStatus:
    string
):
  | {
      status:
        "DIALING" |
        "ANSWERED" |
        "COMPLETED" |
        "FAILED";

      failureCode?:
        string;

      failureMessage?:
        string;
    }
  | null {
  switch (
    providerStatus
  ) {
    //------------------------------------------------
    // Child Leg Starting
    //------------------------------------------------

    case "queued":
    case "initiated":
    case "ringing":
      return {
        status:
          "DIALING",
      };

    //------------------------------------------------
    // Human Answered
    //------------------------------------------------

    case "in-progress":
      return {
        status:
          "ANSWERED",
      };

    //------------------------------------------------
    // Normal Completion
    //------------------------------------------------

    case "completed":
      return {
        status:
          "COMPLETED",
      };

    //------------------------------------------------
    // Busy
    //------------------------------------------------

    case "busy":
      return {
        status:
          "FAILED",

        failureCode:
          "TRANSFER_AGENT_BUSY",

        failureMessage:
          "Human-agent destination was busy.",
      };

    //------------------------------------------------
    // No Answer
    //------------------------------------------------

    case "no-answer":
      return {
        status:
          "FAILED",

        failureCode:
          "TRANSFER_AGENT_NO_ANSWER",

        failureMessage:
          "Human-agent destination did not answer.",
      };

    //------------------------------------------------
    // Provider Failure
    //------------------------------------------------

    case "failed":
      return {
        status:
          "FAILED",

        failureCode:
          "TRANSFER_CHILD_CALL_FAILED",

        failureMessage:
          "Twilio could not complete the human-agent call leg.",
      };

    //------------------------------------------------
    // Canceled Child Leg
    //------------------------------------------------

    case "canceled":
      return {
        status:
          "FAILED",

        failureCode:
          "TRANSFER_CHILD_CALL_CANCELED",

        failureMessage:
          "Human-agent call leg was canceled.",
      };

    default:
      return null;
  }
}

//--------------------------------------------------
// Sequence Number
//--------------------------------------------------

function parseSequenceNumber(
  value:
    unknown
): number | undefined {
  const normalized =
    String(
      value ??
      ""
    )
      .trim();

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
    !Number.isInteger(
      parsed
    ) ||
    parsed <
      0
  ) {
    return undefined;
  }

  return parsed;
}

//--------------------------------------------------
// Twilio SID Validation
//--------------------------------------------------

function isTwilioCallSid(
  value:
    string
): boolean {
  return /^CA[a-fA-F0-9]{32}$/.test(
    value
  );
}

//--------------------------------------------------
// Valid But Ignored Callback
//--------------------------------------------------

function successIgnored(
  reason:
    string
): NextResponse {
  /*
   * Authentication succeeded but the callback could
   * not safely be correlated.
   *
   * Return 200 so Twilio does not retry forever.
   */

  return NextResponse.json({
    success:
      true,

    applied:
      false,

    ignored:
      true,

    reason,
  });
}

//--------------------------------------------------
// Reject GET
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