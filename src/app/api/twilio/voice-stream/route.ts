import {
  NextRequest,
  NextResponse,
} from "next/server";

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

export async function POST(
  request: NextRequest
) {

  try {

    //------------------------------------
    // Query Parameters
    //------------------------------------

    const searchParams =
      request.nextUrl.searchParams;

    const internalCallId =
      searchParams.get(
        "callId"
      );

    //------------------------------------
    // Twilio Form Data
    //------------------------------------

    const formData =
      await request.formData();

    const twilioCallSid =
      String(
        formData.get(
          "CallSid"
        ) ?? ""
      );

    //------------------------------------
    // Validate Call ID
    //------------------------------------

    if (!internalCallId) {

      console.error(
        "Twilio voice stream request is missing internal callId"
      );

      return new NextResponse(
        `
<Response>
  <Say>
    Missing internal call identifier.
  </Say>
  <Hangup/>
</Response>
        `.trim(),
        {
          status: 400,
          headers: {
            "Content-Type":
              "text/xml; charset=utf-8",
          },
        }
      );

    }

    //------------------------------------
    // Validate APP_URL
    //------------------------------------

    const appUrl =
      process.env.APP_URL;

    if (!appUrl) {

      throw new Error(
        "APP_URL environment variable is missing."
      );

    }

    //------------------------------------
    // Build WebSocket URL
    //------------------------------------

    const streamUrl =
      appUrl
        .replace(
          /\/+$/,
          ""
        )
        .replace(
          /^https:/,
          "wss:"
        )
        .replace(
          /^http:/,
          "ws:"
        ) +
      "/api/twilio/stream";

    console.log(
      "Twilio stream TwiML generated:",
      {
        internalCallId,
        twilioCallSid,
        streamUrl,
      }
    );

    //------------------------------------
    // TwiML Response
    //------------------------------------

//     const twiml =
// `<?xml version="1.0" encoding="UTF-8"?>
// <Response>
//   <Connect>
//     <Stream url="${escapeXml(streamUrl)}">
//       <Parameter
//         name="callId"
//         value="${escapeXml(internalCallId)}"
//       />
//       <Parameter
//         name="twilioCallSid"
//         value="${escapeXml(twilioCallSid)}"
//       />
//     </Stream>
//   </Connect>
// </Response>`;

const twiml =
`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}" />
  </Connect>
</Response>`;

    return new NextResponse(
      twiml,
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/xml; charset=utf-8",

          "Cache-Control":
            "no-store",
        },
      }
    );

  } catch (error) {

    console.error(
      "Failed to generate Twilio stream TwiML:",
      error
    );

    return new NextResponse(
      `
<Response>
  <Say>
    Internal server error.
  </Say>
  <Hangup/>
</Response>
      `.trim(),
      {
        status: 500,
        headers: {
          "Content-Type":
            "text/xml; charset=utf-8",
        },
      }
    );

  }

}