import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  ZodError,
} from "zod";

import {
  requireCampaignCapability,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  assertCommunicationCampaignAccess,
  updateCommunicationCampaignSchedule,
} from "@/services/communication/communication-campaign.service";

interface RouteContext {
  params:
    Promise<{
      id:
        string;
    }>;
}

export async function POST(
  request:
    NextRequest,

  context:
    RouteContext
): Promise<NextResponse> {
  try {
    const currentUser =
      await requireCampaignCapability(
        "CAMPAIGN_EDIT"
      );

    const {
      id,
    } =
      await context.params;

    await assertCommunicationCampaignAccess(
      id,
      currentUser
    );

    const body =
      await request.json();

    const campaign =
      await updateCommunicationCampaignSchedule(
        id,
        body,
        currentUser
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          campaign,
      },
      {
        status:
          200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (
    error
  ) {
    const authResponse =
      createAuthErrorResponse(
        error
      );

    if (authResponse) {
      return authResponse;
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid communication campaign schedule",
          issues:
            error.issues,
        },
        {
          status: 400,
        }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Communication campaign schedule failed";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status:
          message.includes("not found")
            ? 404
            : message.includes("cannot be edited")
              ? 409
              : 400,
      }
    );
  }
}
