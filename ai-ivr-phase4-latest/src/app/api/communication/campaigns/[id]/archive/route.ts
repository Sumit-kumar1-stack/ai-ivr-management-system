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
  archiveCommunicationCampaign,
  assertCommunicationCampaignAccess,
} from "@/services/communication/communication-campaign.service";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const currentUser =
      await requireCampaignCapability(
        "CAMPAIGN_EDIT"
      );

    const { id } = await context.params;

    await assertCommunicationCampaignAccess(
      id,
      currentUser
    );

    const campaign =
      await archiveCommunicationCampaign(
        id,
        currentUser
      );

    return NextResponse.json(
      {
        success: true,
        data: campaign,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    const message =
      error instanceof Error ? error.message : "Campaign archive failed";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status:
          message.includes("not found")
            ? 404
            : message.includes("cannot be archived")
              ? 409
              : 400,
      }
    );
  }
}
