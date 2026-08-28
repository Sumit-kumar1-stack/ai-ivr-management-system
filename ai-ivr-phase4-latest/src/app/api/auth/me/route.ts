import {
  NextResponse,
} from "next/server";

import {
  requireUser,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";


export async function GET() {

  try {

    const user =
      await requireUser();


    return NextResponse.json({
      id:
        user.id,

      email:
        user.email,

      role:
        user.role,

      campaignCapabilities:
        user.campaignCapabilities,

      fullName:
        user.fullName,

      phone:
        user.phone,

      avatar:
        user.avatar,

      tenantId:
        user.tenantId,

      tenantName:
        user.tenantName,

      tenantStatus:
        user.tenantStatus,

      accountStatus:
        user.accountStatus,

      isActive:
        user.isActive,
    });

  } catch (error) {

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
      "Failed to retrieve authenticated user",
      error
    );


    return NextResponse.json(
      {
        message:
          "Server error",
      },
      {
        status:
          500,
      }
    );

  }

}
