import {
  UserRole,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  ZodError,
} from "zod";

import {
  requireRole,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  getCommunicationCampaign,
  updateCommunicationCampaignSchedule,
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

const COMMUNICATION_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

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
    await requireRole(
      COMMUNICATION_ROLES
    );

    const {
      id,
    } =
      await context.params;

    const campaign =
      await getCommunicationCampaign(
        id
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
    await requireRole(
      COMMUNICATION_ROLES
    );

    const {
      id,
    } =
      await context.params;

    const body =
      await request.json();

    const campaign =
      await updateCommunicationCampaignSchedule(
        id,
        body
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