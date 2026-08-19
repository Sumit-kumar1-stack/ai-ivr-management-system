import {
  UserRole,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireRole,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  getCommunicationCampaignInsights,
} from "@/services/communication/communication-insights.service";

import {
  tryFinalizeCommunicationCampaign,
} from "@/services/communication/communication-campaign-finalizer.service";

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
// Roles
//--------------------------------------------------

const ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

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
    const currentUser = await requireRole(
      ROLES
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

    // Keep reads self-healing if a provider callback
    // completed while another reconciliation hook was
    // unavailable or lost a process restart.
    await tryFinalizeCommunicationCampaign(id);

    const data =
      await getCommunicationCampaignInsights({
        campaignId:
          id,

        page,
        pageSize,
      });

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
        : "Communication campaign insights could not be loaded";

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
