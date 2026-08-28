import {
  UserRole,
} from "@prisma/client";

import {
  NextResponse,
} from "next/server";

import {
  requireRole,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  listPublishedCommunicationIvrFlows,
} from "@/services/communication/communication-ivr-binding.service";

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

export async function GET():
  Promise<NextResponse> {
  try {
    const currentUser = await requireRole(
      ROLES
    );

    const flows =
      await listPublishedCommunicationIvrFlows(
        currentUser.tenantId
      );

    return NextResponse.json(
      {
        success:
          true,

        data:
          flows,
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
      "Published IVR flow listing failed",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Published IVR flows could not be loaded",
      },
      {
        status:
          500,
      }
    );
  }
}
