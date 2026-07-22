import {
  NextRequest,
  NextResponse,
} from "next/server";


/**
 * The actual Twilio Media Stream is handled
 * by the raw WebSocket upgrade listener in:
 *
 * src/server/twilio-websocket.ts
 *
 * This Next.js route handles only normal HTTP
 * requests made to the same path.
 */


//--------------------------------------------------
// Normal HTTP GET Request
//--------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse> {

  console.warn(
    "Normal HTTP request received on Twilio WebSocket endpoint",
    {
      method:
        request.method,

      pathname:
        request.nextUrl.pathname,

      upgrade:
        request.headers.get(
          "upgrade"
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
        "This endpoint requires a WebSocket upgrade",

      websocketPath:
        "/api/twilio/stream",
    },
    {
      status:
        426,

      headers: {
        Upgrade:
          "websocket",

        Connection:
          "Upgrade",

        "Cache-Control":
          "no-store",
      },
    }
  );

}


//--------------------------------------------------
// Reject Normal HTTP POST Requests
//--------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse> {

  console.warn(
    "HTTP POST received on Twilio WebSocket endpoint",
    {
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
        "This endpoint accepts WebSocket upgrade connections only",

      websocketPath:
        "/api/twilio/stream",
    },
    {
      status:
        426,

      headers: {
        Upgrade:
          "websocket",

        Connection:
          "Upgrade",

        "Cache-Control":
          "no-store",
      },
    }
  );

}