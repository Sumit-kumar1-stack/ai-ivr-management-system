import { NextResponse } from "next/server";

import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth";
import { createAuthErrorResponse } from "@/lib/auth-response";

import {
  createTenantInvitation,
} from "@/features/onboarding/onboarding.service";

import {
  CreateTenantInvitationSchema,
} from "@/features/onboarding/onboarding.schema";

export async function POST(request: Request) {
  try {
    const actor = await requireRole([
      UserRole.SUPER_ADMIN,
    ] as const);

    const body = await request.json();

    const parsed =
      CreateTenantInvitationSchema.safeParse(body);

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

    const result = await createTenantInvitation(
      parsed.data,
      actor.id
    );

    return NextResponse.json(
      {
        success: true,
        message: "Tenant invitation created successfully",
        data: {
          tenant: result.tenant,
          invitation: {
            id: result.invitation.id,
            tenantId: result.invitation.tenantId,
            email: result.invitation.email,
            fullName: result.invitation.fullName,
            role: result.invitation.role,
            status: result.invitation.status,
            invitedAt: result.invitation.invitedAt,
            expiresAt: result.invitation.expiresAt,
          },
          invitationUrl: result.invitationUrl,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    const authResponse =
      createAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    console.error("Failed to create tenant invitation", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create tenant invitation",
      },
      {
        status: 500,
      }
    );
  }
}
