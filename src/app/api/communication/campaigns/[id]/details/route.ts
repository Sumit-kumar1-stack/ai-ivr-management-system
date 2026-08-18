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
  getCommunicationCampaignDetails,
} from "@/services/communication/communication-campaign-details.service";

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
    await requireRole(
      ROLES
    );

    const {
      id,
    } =
      await context.params;

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