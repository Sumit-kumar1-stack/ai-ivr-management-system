import {
  NextResponse,
} from "next/server";

import {
  UserRole,
} from "@prisma/client";

import {
  requireRole,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  ContactService,
} from "@/features/contacts/contact.service";

const CONTACT_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.AGENT,
] as const;

export async function GET() {
  try {
    const currentUser = await requireRole(
      CONTACT_READ_ROLES
    );

    const statistics =
      await ContactService
        .getContactStatistics(
          currentUser.role === UserRole.SUPER_ADMIN
            ? undefined
            : currentUser.id
        );

    return NextResponse.json({
      success:
        true,

      message:
        "Contact statistics fetched successfully",

      data:
        statistics,
    });
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
      "Failed to fetch contact statistics",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Failed to fetch contact statistics",
      },
      {
        status:
          500,
      }
    );
  }
}
