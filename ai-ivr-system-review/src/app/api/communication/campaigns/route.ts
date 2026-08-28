import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  ZodError,
} from "zod";

import {
  requireAnyCampaignCapabilities,
  requireCampaignCapability,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  CAMPAIGN_CAPABILITIES,
} from "@/services/communication/campaign-capabilities";

import {
  createCommunicationCampaign,
  getCommunicationCampaigns,
} from "@/services/communication/communication-campaign.service";

//--------------------------------------------------
// GET
//--------------------------------------------------

export async function GET(): Promise<NextResponse> {
  try {
    const currentUser =
      await requireAnyCampaignCapabilities(
        CAMPAIGN_CAPABILITIES
      );

    const campaigns =
      await getCommunicationCampaigns(
        currentUser
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          campaigns,
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

    console.error(
      "Communication campaigns fetch failed",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          error instanceof
            Error
            ? error.message
            : "Communication campaigns could not be fetched",
      },
      {
        status:
          500,
      }
    );
  }
}

//--------------------------------------------------
// POST
//--------------------------------------------------

export async function POST(
  request:
    NextRequest
): Promise<NextResponse> {
  try {
    const currentUser =
      await requireCampaignCapability(
        "CAMPAIGN_CREATE"
      );

    const body =
      await request.json();

    const campaign =
      await createCommunicationCampaign(
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
          201,

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
            "Invalid communication campaign",

          issues:
            error.issues,
        },
        {
          status:
            400,
        }
      );
    }

    console.error(
      "Communication campaign creation failed",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          error instanceof
            Error
            ? error.message
            : "Communication campaign could not be created",
      },
      {
        status:
          500,
      }
    );
  }
}
