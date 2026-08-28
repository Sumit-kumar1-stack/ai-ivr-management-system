import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

//--------------------------------------------------
// Process Start Time
//--------------------------------------------------

const processStartedAt =
  Date.now();

//--------------------------------------------------
// Health Check
//--------------------------------------------------

export async function GET():
  Promise<NextResponse> {
  const now =
    new Date();

  return NextResponse.json(
    {
      success:
        true,

      status:
        "healthy",

      service:
        "ai-ivr-management-system",

      environment:
        process.env.NODE_ENV ??
        "development",

      timestamp:
        now.toISOString(),

      uptimeSeconds:
        Math.floor(
          process.uptime()
        ),

      processAgeMs:
        Math.max(
          Date.now() -
            processStartedAt,
          0
        ),
    },
    {
      status:
        200,

      headers: {
        "Cache-Control":
          "no-store, max-age=0",

        Pragma:
          "no-cache",
      },
    }
  );
}