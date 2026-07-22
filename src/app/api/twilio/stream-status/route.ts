import {
  NextRequest,
  NextResponse,
} from "next/server";

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


    console.log(
      "TWILIO STREAM STATUS",
      {
        callSid:
          params.CallSid,

        streamSid:
          params.StreamSid,

        streamEvent:
          params.StreamEvent,

        streamError:
          params.StreamError,
      }
    );


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
      "Twilio stream-status error",
      error
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