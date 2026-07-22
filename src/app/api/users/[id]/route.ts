import {
  NextRequest,
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
  UserRepository,
} from "@/features/users/user.repository";


interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}


const USER_MANAGEMENT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;


//--------------------------------------------------
// Get User
//--------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {

  try {

    await requireRole(
      USER_MANAGEMENT_ROLES
    );


    const {
      id,
    } = await params;


    const user =
      await UserRepository.findById(
        id
      );


    if (
      !user
    ) {
      return NextResponse.json(
        {
          message:
            "User not found",
        },
        {
          status:
            404,
        }
      );
    }


    /*
     * Do not expose password hashes.
     */
    const {
      password:
        _password,

      ...safeUser
    } = user;


    return NextResponse.json({
      success:
        true,

      data:
        safeUser,
    });

  } catch (error) {

    return handleRouteError(
      error,
      "Failed to fetch user"
    );

  }

}


//--------------------------------------------------
// Update User
//--------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: RouteContext
) {

  try {

    const currentUser =
      await requireRole(
        USER_MANAGEMENT_ROLES
      );


    const {
      id,
    } = await params;


    const body =
      await request.json();


    /*
     * ADMIN users must not promote users to
     * SUPER_ADMIN.
     */
    if (
      currentUser.role ===
        UserRole.ADMIN &&
      body.role ===
        UserRole.SUPER_ADMIN
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Only a super administrator can assign the SUPER_ADMIN role",
        },
        {
          status:
            403,
        }
      );
    }


    const updated =
      await UserRepository.update(
        id,
        body
      );


    const {
      password:
        _password,

      ...safeUser
    } = updated;


    return NextResponse.json({
      success:
        true,

      message:
        "User updated successfully",

      data:
        safeUser,
    });

  } catch (error) {

    return handleRouteError(
      error,
      "Failed to update user"
    );

  }

}


//--------------------------------------------------
// Delete User
//--------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {

  try {

    const currentUser =
      await requireRole(
        USER_MANAGEMENT_ROLES
      );


    const {
      id,
    } = await params;


    if (
      id === currentUser.id
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "You cannot delete your own account",
        },
        {
          status:
            409,
        }
      );
    }


    const targetUser =
      await UserRepository.findById(
        id
      );


    if (
      !targetUser
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "User not found",
        },
        {
          status:
            404,
        }
      );
    }


    if (
      currentUser.role ===
        UserRole.ADMIN &&
      targetUser.role ===
        UserRole.SUPER_ADMIN
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Administrators cannot delete super administrators",
        },
        {
          status:
            403,
        }
      );
    }


    await UserRepository.delete(
      id
    );


    return NextResponse.json({
      success:
        true,

      message:
        "User deleted successfully",
    });

  } catch (error) {

    return handleRouteError(
      error,
      "Failed to delete user"
    );

  }

}


//--------------------------------------------------
// Shared Error Handler
//--------------------------------------------------

function handleRouteError(
  error: unknown,
  fallbackMessage: string
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


  console.error(
    fallbackMessage,
    error
  );


  return NextResponse.json(
    {
      success:
        false,

      message:
        fallbackMessage,
    },
    {
      status:
        500,
    }
  );

}