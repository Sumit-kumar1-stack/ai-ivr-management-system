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
) {

  try {

    const {
      params,
    } = await validateTwilioWebhook(
      request
    );


    const digits =
      String(
        params.Digits ??
        ""
      ).trim();


    let message:
      string;


    switch (
      digits
    ) {

      case "1":

        message =
          "You selected Sales. Connecting you to the sales team.";

        break;


      case "2":

        message =
          "You selected Support. Our support team will assist you.";

        break;


      case "3":

        message =
          "Connecting you to a human agent.";

        break;


      default:

        message =
          "Invalid option. Please try again.";

    }


    return createTwimlResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    ${escapeXml(message)}
  </Say>
</Response>`
    );

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
      "Twilio DTMF input failed",
      error
    );


    return createTwimlResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    An error occurred while processing your selection.
  </Say>
  <Hangup />
</Response>`
    );

  }

}


function createTwimlResponse(
  xml: string
): NextResponse {

  return new NextResponse(
    xml,
    {
      status:
        200,

      headers: {
        "Content-Type":
          "text/xml; charset=utf-8",

        "Cache-Control":
          "no-store",
      },
    }
  );

}


function escapeXml(
  value: string
): string {

  return value
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&apos;"
    );

}