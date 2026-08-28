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
  UserService,
} from "@/features/users/user.service";

import {
  CreateUserSchema,
} from "@/features/users/user.schema";

import {
  toUserResponse,
} from "@/features/users/user.mapper";


const USER_MANAGEMENT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;


//--------------------------------------------------
// Get Users
//--------------------------------------------------

export async function GET() {

  try {

    await requireRole(
      USER_MANAGEMENT_ROLES
    );


    const users =
      await UserService.getUsers();


    return NextResponse.json({
      success:
        true,

      message:
        "Users fetched successfully",

      data:
        users.map(
          toUserResponse
        ),
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
      "Failed to fetch users",
      error
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Failed to fetch users",
      },
      {
        status:
          500,
      }
    );

  }

}


//--------------------------------------------------
// Create User
//--------------------------------------------------

export async function POST(
  request: NextRequest
) {

  try {

    await requireRole(
      USER_MANAGEMENT_ROLES
    );


    const body =
      await request.json();


    const parsed =
      CreateUserSchema.safeParse(
        body
      );


    if (
      !parsed.success
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Invalid request data",

          errors:
            parsed.error.flatten(),
        },
        {
          status:
            400,
        }
      );
    }


    const user =
      await UserService.createUser(
        parsed.data
      );


    return NextResponse.json(
      {
        success:
          true,

        message:
          "User created successfully",

        data:
          toUserResponse(
            user
          ),
      },
      {
        status:
          201,
      }
    );

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
      "Failed to create user",
      error
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Failed to create user",
      },
      {
        status:
          500,
      }
    );

  }

}