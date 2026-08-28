import {
  UserRole,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  z,
  ZodError,
} from "zod";

import {
  requireRole,
  isAuthenticationError,
  isAuthorizationError,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  assertCallOwnership,
} from "@/services/security/tenant-access.service";

import {
  getCallSecuritySession,
  updateCallSecuritySession,
} from "@/services/security/call-security-session.service";

const ROLES:
  readonly UserRole[] = [
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ];

const updateSchema =
  z.object({
    authenticationLevel:
      z.enum([
        "AUTH_LEVEL_0",
        "AUTH_LEVEL_1",
        "AUTH_LEVEL_2",
        "AUTH_LEVEL_3",
      ])
      .optional(),

    riskLevel:
      z.enum([
        "LOW",
        "MEDIUM",
        "HIGH",
      ]).optional(),

    securityFlags:
      z.record(z.string(), z.unknown())
      .optional(),

    trusted:
      z.boolean().default(false),
  });

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const currentUser = await requireRole(
      ROLES
    );

    const { id } =
      await context.params;

    const callId = id.trim();

    await assertCallOwnership(
      callId,
      currentUser
    );

    const session =
      await getCallSecuritySession(
        callId
      );

    if (
      !session
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Call was not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: session,
      },
      {
        headers: {
          "Cache-Control": "no-store",
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
      error instanceof Error
        ? error.message
        : "Call security session could not be loaded";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status:
          message.includes("not found")
            ? 404
            : 400,
      }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const currentUser = await requireRole(
      ROLES
    );

    const { id } =
      await context.params;

    const callId = id.trim();

    await assertCallOwnership(
      callId,
      currentUser
    );

    const body =
      updateSchema.parse(
        await request.json()
      );

    const session =
      await getCallSecuritySession(
        callId
      );

    if (
      !session
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Call was not found",
        },
        { status: 404 }
      );
    }

    if (
      !body.trusted &&
      body.authenticationLevel &&
      body.authenticationLevel !==
        session.authenticationLevel
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Authentication level can only be raised by trusted backend verification.",
        },
        {
          status: 403,
        }
      );
    }

    const result =
      await updateCallSecuritySession(
        callId,
        body
      );

    if (
      !result.success
    ) {
      return NextResponse.json(
        {
          success: false,
          message: result.message,
          code: result.code,
        },
        {
          status:
            result.code ===
              "CALL_NOT_FOUND"
              ? 404
              : 403,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: result.session,
      },
      {
        headers: {
          "Cache-Control": "no-store",
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
      error instanceof ZodError
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid call security session",
          issues: error.issues,
        },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Call security session could not be updated";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status:
          message.includes("not found")
            ? 404
            : 400,
      }
    );
  }
}
