import {
  NextResponse,
} from "next/server";

//--------------------------------------------------
// Disabled Generic Telephony Webhook
//--------------------------------------------------

export async function POST():
  Promise<NextResponse> {
  console.warn(
    "Rejected request to disabled generic telephony webhook",
    {
      route:
        "/api/telephony/webhook",
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