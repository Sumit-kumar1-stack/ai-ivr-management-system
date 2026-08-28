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
  updateCommunicationCampaignChannels,
  assertCommunicationCampaignAccess,
} from "@/services/communication/communication-campaign.service";

interface RouteContext {
  params:
    Promise<{
      id:
        string;
    }>;
}

export async function PUT(
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
      await updateCommunicationCampaignChannels(
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

    if (
      authResponse
    ) {
      return authResponse;
    }

    if (
      error instanceof
      ZodError
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Invalid communication channel selection",

          issues:
            error.issues,
        },
        {
          status:
            400,
        }
      );
    }

    const message =
      error instanceof
        Error
        ? error.message
        : "Communication channels could not be saved";

    return NextResponse.json(
      {
        success:
          false,

        message,
      },
      {
        status:
          message.includes(
            "not found"
          )
            ? 404
            : message.includes(
                  "cannot be edited"
                ) ||
                message.includes(
                  "changed while"
                )
              ? 409
              : 400,
      }
    );
  }
}
