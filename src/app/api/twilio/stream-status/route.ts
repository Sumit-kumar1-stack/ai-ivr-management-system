import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "twilio-stream-status-route"
  );

//--------------------------------------------------
// Twilio Stream Status Callback
//--------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    const callSid =
      String(
        params.CallSid ??
          ""
      ).trim();

    const streamSid =
      String(
        params.StreamSid ??
          ""
      ).trim();

    const streamEvent =
      String(
        params.StreamEvent ??
          ""
      ).trim();

    const streamError =
      String(
        params.StreamError ??
          ""
      ).trim();

    log.info(
      {
        event:
          "twilio.stream_status.received",

        callSidPresent:
          Boolean(
            callSid
          ),

        streamSidPresent:
          Boolean(
            streamSid
          ),

        streamEventPresent:
          Boolean(
            streamEvent
          ),

        streamErrorPresent:
          Boolean(
            streamError
          ),

        streamErrorCharacterCount:
          streamError.length,
      },
      "Twilio stream status callback received"
    );

    return NextResponse.json({
      success:
        true,
    });
  } catch (
    error
  ) {
    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    log.error(
      {
        event:
          "twilio.stream_status.failed",

        error:
          normalizeError(
            error
          ),
      },
      "Twilio stream status callback failed"
    );

    return NextResponse.json(
      {
        success:
          false,
      },
      {
        status:
          500,
      }
    );
  }
}