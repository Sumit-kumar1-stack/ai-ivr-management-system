import {
  NextResponse,
} from "next/server";

//--------------------------------------------------
// Disabled Legacy Telephony Webhook
//--------------------------------------------------

export async function POST():
  Promise<NextResponse> {
  console.warn(
    "Rejected request to disabled legacy telephony webhook",
    {
      route:
        "/api/webhooks/telephony",
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