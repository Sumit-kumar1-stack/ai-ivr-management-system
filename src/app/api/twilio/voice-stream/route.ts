import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";


//--------------------------------------------------
// Twilio Voice Stream Webhook
//--------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse> {

  let internalCallId =
    "";

  let twilioCallSid =
    "";


  try {

    //----------------------------------------------
    // Validate Twilio HTTP Signature
    //----------------------------------------------

    const {
      params,
    } = await validateTwilioWebhook(
      request
    );


    internalCallId =
      request.nextUrl
        .searchParams
        .get(
          "callId"
        )
        ?.trim() ??
      "";


    twilioCallSid =
      String(
        params.CallSid ??
        ""
      ).trim();


    //----------------------------------------------
    // Validate Required Identifiers
    //----------------------------------------------

    if (
      !internalCallId
    ) {

      console.error(
        "Twilio voice-stream missing internal callId",
        {
          twilioCallSid:
            twilioCallSid ||
            undefined,
        }
      );


      return createTwimlResponse(`
<Response>
  <Say voice="alice">
    We could not initialize this call.
  </Say>
  <Hangup />
</Response>
`);

    }


    if (
      !twilioCallSid
    ) {

      console.error(
        "Twilio voice-stream missing CallSid",
        {
          internalCallId,
        }
      );


      return createTwimlResponse(`
<Response>
  <Say voice="alice">
    We could not verify this call.
  </Say>
  <Hangup />
</Response>
`);

    }


    const log =
      createCallLogger(
        internalCallId
      );


    //----------------------------------------------
    // Validate Internal Call Association
    //----------------------------------------------

    const call =
      await prisma.call.findUnique({
        where: {
          id:
            internalCallId,
        },

        select: {
          id:
            true,

          providerCallId:
            true,

          status:
            true,
        },
      });


    if (
      !call
    ) {

      log.error(
        {
          internalCallId,
          twilioCallSid,
        },
        "Internal call record not found"
      );


      return createTwimlResponse(`
<Response>
  <Say voice="alice">
    The call session could not be found.
  </Say>
  <Hangup />
</Response>
`);

    }


    /*
     * If a provider SID is already stored,
     * it must match the signed Twilio CallSid.
     */
    if (
      call.providerCallId &&
      call.providerCallId !==
        twilioCallSid
    ) {

      log.error(
        {
          internalCallId,

          storedProviderCallId:
            call.providerCallId,

          receivedTwilioCallSid:
            twilioCallSid,
        },
        "Twilio call association mismatch"
      );


      return new NextResponse(
        "Forbidden",
        {
          status:
            403,
        }
      );

    }


    /*
     * Associate the Twilio CallSid if it was not
     * already saved during outbound call creation.
     */
    if (
      !call.providerCallId
    ) {

      await prisma.call.updateMany({
        where: {
          id:
            internalCallId,

          providerCallId:
            null,
        },

        data: {
          providerCallId:
            twilioCallSid,
        },
      });


      log.info(
        {
          twilioCallSid,
        },
        "Twilio CallSid associated with internal call"
      );

    }


    //----------------------------------------------
    // Resolve Main Application URL
    //----------------------------------------------

    const appUrl =
      normalizeAppUrl(
        process.env
          .TWILIO_PUBLIC_BASE_URL ??
        process.env.APP_URL
      );


    if (
      !appUrl
    ) {

      throw new Error(
        "TWILIO_PUBLIC_BASE_URL or APP_URL is not configured"
      );

    }


    //----------------------------------------------
    // Resolve Dedicated Media Server URL
    //----------------------------------------------

    const mediaPublicUrl =
      normalizeAppUrl(
        process.env
          .TWILIO_MEDIA_PUBLIC_URL
      );


    if (
      !mediaPublicUrl
    ) {

      throw new Error(
        "TWILIO_MEDIA_PUBLIC_URL is not configured"
      );

    }


    const streamUrl =
      toWebSocketUrl(
        mediaPublicUrl,
        "/api/twilio/stream"
      );


    const streamStatusUrl =
      new URL(
        "/api/twilio/stream-status",
        `${appUrl}/`
      ).toString();


    //----------------------------------------------
    // Build TwiML
    //----------------------------------------------

    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream
      url="${escapeXml(
        streamUrl
      )}"
      statusCallback="${escapeXml(
        streamStatusUrl
      )}"
      statusCallbackMethod="POST"
    >
      <Parameter
        name="callId"
        value="${escapeXml(
          internalCallId
        )}"
      />
      <Parameter
        name="twilioCallSid"
        value="${escapeXml(
          twilioCallSid
        )}"
      />
    </Stream>
  </Connect>
</Response>`;


    log.info(
      {
        twilioCallSid,
        streamUrl,
        streamStatusUrl,
        mediaPublicUrl,
      },
      "Returning authenticated Twilio Media Stream TwiML"
    );


    return createTwimlResponse(
      twiml
    );

  } catch (error) {

    //----------------------------------------------
    // Twilio Authentication Error
    //----------------------------------------------

    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );


    if (
      authResponse
    ) {

      return authResponse;

    }


    //----------------------------------------------
    // Generic Initialization Error
    //----------------------------------------------

    console.error(
      "Failed to initialize Twilio voice stream",
      {
        internalCallId:
          internalCallId ||
          undefined,

        twilioCallSid:
          twilioCallSid ||
          undefined,

        error:
          error instanceof Error
            ? error.message
            : String(
                error
              ),
      }
    );


    return createTwimlResponse(`
<Response>
  <Say voice="alice">
    A call initialization error occurred.
  </Say>
  <Hangup />
</Response>
`);

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
      },
    }
  );

}


//--------------------------------------------------
// XML Response
//--------------------------------------------------

function createTwimlResponse(
  twiml: string
): NextResponse {

  return new NextResponse(
    twiml.trim(),
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


//--------------------------------------------------
// Normalize Public URL
//--------------------------------------------------

function normalizeAppUrl(
  value:
    | string
    | undefined
): string | null {

  const normalized =
    value
      ?.trim()
      .replace(
        /\/+$/,
        ""
      );


  return normalized ||
    null;

}


//--------------------------------------------------
// Convert HTTP URL To WebSocket URL
//--------------------------------------------------

function toWebSocketUrl(
  baseUrl: string,
  pathname: string
): string {

  const url =
    new URL(
      pathname,
      `${baseUrl}/`
    );


  if (
    url.protocol ===
    "https:"
  ) {

    url.protocol =
      "wss:";

  } else if (
    url.protocol ===
    "http:"
  ) {

    url.protocol =
      "ws:";

  } else if (
    url.protocol !==
      "wss:" &&
    url.protocol !==
      "ws:"
  ) {

    throw new Error(
      `Unsupported URL protocol: ${url.protocol}`
    );

  }


  return url.toString();

}


//--------------------------------------------------
// Escape XML Values
//--------------------------------------------------

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