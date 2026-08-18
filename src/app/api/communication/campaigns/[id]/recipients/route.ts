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
  ingestCommunicationRecipients,
} from "@/services/communication/communication-recipient.service";

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
// POST
//--------------------------------------------------

export async function POST(
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

    const body =
      await request.json();

    const result =
      await ingestCommunicationRecipients(
        id,
        body
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
            "Invalid communication recipient batch",

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
        : "Recipient import failed";

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
                  "cannot be changed"
                )
              ? 409
              : 400,
      }
    );
  }
}