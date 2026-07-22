import {
  NextRequest,
  NextResponse,
} from "next/server";


/**
 * This route is intentionally disabled.
 *
 * Twilio Media Stream audio is received through:
 *
 *   wss://<public-domain>/api/twilio/stream
 *
 * The WebSocket upgrade is handled by:
 *
 *   src/server/twilio-websocket.ts
 *
 * Do not submit Twilio audio through this HTTP route.
 */


//--------------------------------------------------
// Reject GET
//--------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse> {

  console.warn(
    "Request received on disabled Twilio media HTTP endpoint",
    {
      method:
        request.method,

      pathname:
        request.nextUrl.pathname,

      userAgent:
        request.headers.get(
          "user-agent"
        ),
    }
  );


  return NextResponse.json(
    {
      success:
        false,

      message:
        "Twilio media HTTP endpoint is disabled",

      mediaTransport:
        "WebSocket",

      websocketPath:
        "/api/twilio/stream",
    },
    {
      status:
        410,

      headers: {
        "Cache-Control":
          "no-store",
      },
    }
  );

}


//--------------------------------------------------
// Reject POST
//--------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse> {

  console.warn(
    "POST received on disabled Twilio media HTTP endpoint",
    {
      method:
        request.method,

      pathname:
        request.nextUrl.pathname,

      contentType:
        request.headers.get(
          "content-type"
        ),

      userAgent:
        request.headers.get(
          "user-agent"
        ),
    }
  );


  return NextResponse.json(
    {
      success:
        false,

      message:
        "Twilio media must be sent through the WebSocket stream",

      mediaTransport:
        "WebSocket",

      websocketPath:
        "/api/twilio/stream",
    },
    {
      status:
        410,

      headers: {
        "Cache-Control":
          "no-store",
      },
    }
  );

}