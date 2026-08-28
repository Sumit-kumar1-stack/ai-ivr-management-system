import { NextRequest, NextResponse } from "next/server";

import {
  AcceptTenantInvitationSchema,
} from "@/features/onboarding/onboarding.schema";

import {
  acceptTenantInvitation,
  getTenantInvitationByToken,
} from "@/features/onboarding/onboarding.service";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { signToken } from "@/lib/jwt";
import { AppError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{
    token: string;
  }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const { token } = await params;
  const invitation = await getTenantInvitationByToken(token);

  if (!invitation) {
    return NextResponse.json(
      {
        success: false,
        message: "Invitation not found",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      email: invitation.email,
      fullName: invitation.fullName,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      tenant: {
        id: invitation.tenant.id,
        name: invitation.tenant.name,
        slug: invitation.tenant.slug,
        status: invitation.tenant.status,
      },
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const parsed = AcceptTenantInvitationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request data",
          errors: parsed.error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    const user = await acceptTenantInvitation(token, parsed.data);
    const tokenValue = signToken({
      userId: user.id,
      role: user.role,
    });

    const response = NextResponse.json(
      {
        success: true,
        message: "Invitation accepted successfully",
        data: {
          id: user.id,
          email: user.email,
          role: user.role,
          fullName: user.fullName,
        },
      },
      {
        status: 201,
      }
    );

    response.cookies.set(
      AUTH_COOKIE_NAME,
      tokenValue,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 8,
      }
    );

    return response;
  } catch (error) {
    console.error("Failed to accept tenant invitation", error);

    const statusCode =
      error instanceof AppError
        ? error.statusCode
        : error instanceof Error && /not found|expired|no longer valid/i.test(error.message)
          ? 400
          : 500;

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to accept invitation",
      },
      {
        status: statusCode,
      }
    );
  }
}
