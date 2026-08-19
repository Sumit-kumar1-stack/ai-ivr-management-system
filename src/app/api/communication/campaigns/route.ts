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
  createCommunicationCampaign,
  getCommunicationCampaigns,
} from "@/services/communication/communication-campaign.service";

//--------------------------------------------------
// Allowed Roles
//--------------------------------------------------

const COMMUNICATION_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

//--------------------------------------------------
// GET
//--------------------------------------------------

export async function GET(): Promise<NextResponse> {
  try {
    const currentUser = await requireRole(
      COMMUNICATION_ROLES
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
    const currentUser = await requireRole(
      COMMUNICATION_ROLES
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
