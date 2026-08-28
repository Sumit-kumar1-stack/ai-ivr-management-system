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
  CAMPAIGN_CAPABILITIES,
} from "@/services/communication/campaign-capabilities";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  getCommunicationCampaign,
  assertCommunicationCampaignAccess,
  updateCommunicationCampaignSchedule,
  deleteCommunicationCampaign,
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
  _request:
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

    const campaign =
      await getCommunicationCampaign(
        id,
        currentUser
      );

    if (
      !campaign
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Communication campaign not found",
        },
        {
          status:
            404,
        }
      );
    }

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
    return handleError(
      error
    );
  }
}

//--------------------------------------------------
// PATCH
//--------------------------------------------------

export async function PATCH(
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
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (
    error
  ) {
    return handleError(
      error
    );
  }
}

//--------------------------------------------------
// Error Handler
//--------------------------------------------------

function handleError(
  error:
    unknown
): NextResponse {
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
          "Invalid communication campaign update",

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
      : "Communication campaign request failed";

  const status =
    message.includes(
      "not found"
    )
      ? 404
      : message.includes(
            "cannot be edited"
          )
        ? 409
        : message.includes(
              "cannot be deleted"
            )
          ? 409
        : message.includes(
              "must be in the future"
            )
          ? 400
          : 500;

  console.error(
    "Communication campaign request failed",
    error
  );

  return NextResponse.json(
    {
      success:
        false,

      message,
    },
    {
      status,
    }
  );
}

//--------------------------------------------------
// DELETE
//--------------------------------------------------

export async function DELETE(
  _request:
    NextRequest,

  context:
    RouteContext
): Promise<NextResponse> {
  try {
    const currentUser =
      await requireAnyCampaignCapabilities(
        ["CAMPAIGN_EDIT", "CAMPAIGN_DELETE"]
      );

    const {
      id,
    } =
      await context.params;

    await assertCommunicationCampaignAccess(
      id,
      currentUser
    );

    const result =
      await deleteCommunicationCampaign(
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
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (
    error
  ) {
    return handleError(
      error
    );
  }
}
