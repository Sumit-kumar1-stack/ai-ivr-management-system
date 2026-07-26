import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";

import {
  updateCallStatus,
} from "@/services/calls/call.service";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    //----------------------------------------
    // Validate Twilio signature and parse body
    //----------------------------------------

    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    //----------------------------------------
    // Internal database call ID
    //----------------------------------------

    const internalCallId =
      request.nextUrl.searchParams
        .get(
          "callId"
        )
        ?.trim() ||
      undefined;

    //----------------------------------------
    // Twilio callback values
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

    if (
      !providerCallId ||
      !providerStatus
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "CallSid and CallStatus are required",
        },
        {
          status: 400,
        }
      );
    }

    //----------------------------------------
    // Parse duration safely
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
      parsedDuration >= 0
        ? Math.floor(
            parsedDuration
          )
        : undefined;

    console.log(
      "Twilio status callback received",
      {
        internalCallId,
        providerCallId,
        providerStatus,
        duration,
      }
    );

    //----------------------------------------
    // Update internal call lifecycle
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

    if (
      result.count === 0
    ) {
      console.warn(
        "Twilio status callback did not match an internal call",
        {
          internalCallId,
          providerCallId,
          providerStatus,
        }
      );
    }

    /*
     * Return HTTP 200 even when no matching
     * internal record exists. This prevents
     * repeated Twilio retries for a callback
     * that cannot be resolved.
     */
    return NextResponse.json({
      success: true,

      matched:
        result.count > 0,

      ignored:
        result.count === 0,
    });
  } catch (error) {
    //----------------------------------------
    // Signature validation response
    //----------------------------------------

    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (authResponse) {
      return authResponse;
    }

    console.error(
      "Twilio status callback failed",
      {
        error:
          error instanceof Error
            ? error.message
            : String(
                error
              ),
      }
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Failed to process status callback",
      },
      {
        status: 500,
      }
    );
  }
}