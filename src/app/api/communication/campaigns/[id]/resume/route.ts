import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireCampaignCapability,
} from "@/lib/auth";
import {
  createAuthErrorResponse,
} from "@/lib/auth-response";
import {
  resumeCommunicationCampaign,
} from "@/services/communication/communication-campaign-runtime-lifecycle.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const actor =
      await requireCampaignCapability(
        "CAMPAIGN_LAUNCH"
      );
    const { id } = await context.params;
    const data =
      await resumeCommunicationCampaign(
        id,
        actor
      );

    return NextResponse.json(
      { success: true, data },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const auth = createAuthErrorResponse(error);
    if (auth) return auth;

    const message =
      error instanceof Error
        ? error.message
        : "Communication campaign resume failed";

    return NextResponse.json(
      { success: false, message },
      {
        status: message.includes("not found")
          ? 404
          : message.includes("not allowed") ||
              message.includes("concurrently")
            ? 409
            : 400,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
