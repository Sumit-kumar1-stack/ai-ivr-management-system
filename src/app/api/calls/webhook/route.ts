import {
  NextResponse,
} from "next/server";

//--------------------------------------------------
// Disabled Legacy Webhook
//--------------------------------------------------

export async function POST():
  Promise<NextResponse> {
  console.warn(
    "Rejected request to disabled legacy webhook",
    {
      route:
        "/api/calls/webhook",
    }
  );

  return NextResponse.json(
    {
      success:
        false,

      message:
        "This webhook endpoint is disabled",
    },
    {
      status:
        410,
    }
  );
}