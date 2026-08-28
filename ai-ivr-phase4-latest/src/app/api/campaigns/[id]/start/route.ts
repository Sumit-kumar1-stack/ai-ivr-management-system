import {
  NextResponse,
} from "next/server";

function legacyCampaignResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      message:
        "Legacy campaign routes are deprecated. Use /api/communication/campaigns instead.",
    },
    {
      status: 410,
    }
  );
}

export async function POST(): Promise<NextResponse> {
  return legacyCampaignResponse();
}
