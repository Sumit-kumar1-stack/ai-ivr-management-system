import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createRateLimitResponse,
  ensureRateLimit,
  readClientAddress,
} from "@/lib/abuse-control";

import {
  requireCampaignCapability,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  launchCommunicationCampaign,
} from "@/services/communication/communication-launch.service";

import {
  assertCommunicationCampaignAccess,
} from "@/services/communication/communication-campaign.service";

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

export async function POST(
  _request:
    NextRequest,

  context:
    RouteContext
): Promise<NextResponse> {
  try {
    const currentUser =
      await requireCampaignCapability(
        "CAMPAIGN_LAUNCH"
      );

    const {
      id,
    } =
      await context.params;

    await assertCommunicationCampaignAccess(
      id,
      currentUser
    );

    await ensureRateLimit({
      scope:
        "communication-launch",

      limit:
        3,

      windowMs:
        15 *
        60 *
        1000,

      keyParts: [
        currentUser.id,

        id,

        readClientAddress(
          _request
        ),
      ],
    });

    const result =
      await launchCommunicationCampaign(
        id,
        currentUser
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
    const rateLimitResponse =
      createRateLimitResponse(
        error
      );

    if (
      rateLimitResponse
    ) {
      return rateLimitResponse;
    }

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
              "not authorized"
            )
          ? 403
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
