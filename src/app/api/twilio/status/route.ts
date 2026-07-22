import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  updateCallStatus,
} from "@/services/calls/call.service";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";


export async function POST(
  request: NextRequest
): Promise<NextResponse> {

  try {

    const {
      params,
    } = await validateTwilioWebhook(
      request
    );


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
      )
        ? parsedDuration
        : undefined;


    const result =
      await updateCallStatus({
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
          providerCallId,
          providerStatus,
        }
      );

    }


    return NextResponse.json({
      success:
        true,
    });

  } catch (error) {

    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );


    if (
      authResponse
    ) {

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