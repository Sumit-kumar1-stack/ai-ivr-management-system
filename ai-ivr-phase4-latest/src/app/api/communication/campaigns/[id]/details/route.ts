import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireAnyCampaignCapabilities,
} from "@/lib/auth";

import {
  CAMPAIGN_CAPABILITIES,
} from "@/services/communication/campaign-capabilities";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  getCommunicationCampaignDetails,
} from "@/services/communication/communication-campaign-details.service";

import {
  assertCommunicationCampaignAccess,
} from "@/services/communication/communication-campaign.service";

//--------------------------------------------------
// Context
//--------------------------------------------------

interface RouteContext {
  params:
    Promise<{
      id:
        string;
    }>;
}

//--------------------------------------------------
// GET
//--------------------------------------------------

export async function GET(
  request:
    NextRequest,

  context:
    RouteContext
): Promise<NextResponse> {
  try {
    const currentUser =
      await requireAnyCampaignCapabilities(
        CAMPAIGN_CAPABILITIES
      );

    const {
      id,
    } =
      await context.params;

    await assertCommunicationCampaignAccess(
      id,
      currentUser
    );

    const page =
      parsePositiveInteger(
        request
          .nextUrl
          .searchParams
          .get(
            "page"
          ),
        1
      );

    const pageSize =
      parsePositiveInteger(
        request
          .nextUrl
          .searchParams
          .get(
            "pageSize"
          ),
        25
      );

    const data =
      await getCommunicationCampaignDetails(
        id,
        {
          page,
          pageSize,
        }
      );

    return NextResponse.json(
      {
        success:
          true,

        data,
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

    const message =
      error instanceof
        Error
        ? error.message
        : "Communication campaign details could not be loaded";

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
            : 400,
      }
    );
  }
}

//--------------------------------------------------
// Integer
//--------------------------------------------------

function parsePositiveInteger(
  value:
    string |
    null,

  fallback:
    number
): number {
  if (
    !value
  ) {
    return fallback;
  }

  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }

  return Math.floor(
    parsed
  );
}
