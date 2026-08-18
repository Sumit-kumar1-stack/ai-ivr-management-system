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
  launchCommunicationCampaign,
} from "@/services/communication/communication-launch.service";

import {
  isCommunicationUsageLimitError,
} from "@/services/communication/communication-usage-limit.service";

interface RouteContext {
  params:
    Promise<{
      id:
        string;
    }>;
}

const ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export async function POST(
  _request:
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

    const result =
      await launchCommunicationCampaign(
        id
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          result,
      },
      {
        status:
          202,

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

    //------------------------------------------------
    // Plan Limit
    //------------------------------------------------

    if (
      isCommunicationUsageLimitError(
        error
      )
    ) {
      const status =
        error.code ===
          "COMMUNICATION_LAUNCH_CONFLICT"
          ? 409
          : 429;

      return NextResponse.json(
        {
          success:
            false,

          code:
            error.code,

          message:
            error.message,

          limit: {
            tier:
              error.tier,

            allowed:
              error.limit,

            current:
              error.current,

            requested:
              error.requested,
          },
        },
        {
          status,

          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const message =
      error instanceof
        Error
        ? error.message
        : "Communication campaign launch failed";

    const status =
      message.includes(
        "not found"
      )
        ? 404
        : message.includes(
              "cannot be launched"
            )
          ? 409
          : 400;

    return NextResponse.json(
      {
        success:
          false,

        message,
      },
      {
        status,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}