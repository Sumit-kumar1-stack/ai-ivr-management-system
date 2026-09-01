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
  CreateTenantUserSchema,
  PlatformCreateUserSchema,
} from "@/features/users/user.schema";

import {
  toUserResponse,
} from "@/features/users/user.mapper";
import { hasCampaignCapability } from "@/services/communication/campaign-capabilities";

const USER_MANAGEMENT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

const PLATFORM_SCOPE = "platform";

function canManageUsers(user: { role: UserRole; campaignCapabilities?: readonly string[] }): boolean {
  if (user.role === UserRole.SUPER_ADMIN) return true;
  if (user.campaignCapabilities === undefined) return true;
  return hasCampaignCapability(user.campaignCapabilities, "ORG_USERS_MANAGE");
}

//--------------------------------------------------
// Get Users
//--------------------------------------------------

export async function GET(
  request: NextRequest
) {

  try {

    const currentUser =
      await requireRole(
      USER_MANAGEMENT_ROLES
      );

    if (!canManageUsers(currentUser)) {
      return NextResponse.json(
        {
          success: false,
          message: "You do not have permission to manage organization users.",
        },
        { status: 403 }
      );
    }

    const scope =
      request.nextUrl.searchParams.get(
        "scope"
      )?.trim();

    if (
      scope === PLATFORM_SCOPE &&
      currentUser.role !== UserRole.SUPER_ADMIN
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Only a super administrator can use the platform users scope",
        },
        {
          status: 403,
        }
      );
    }

    const tenantId =
      currentUser.tenantId?.trim() ??
      "";

    if (
      !tenantId &&
      scope !== PLATFORM_SCOPE
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Authenticated tenant is required to list tenant users",
        },
        {
          status: 403,
        }
      );
    }

    const users =
      scope === PLATFORM_SCOPE
        ? await UserService.getUsers()
        : await UserService.getUsersForTenant(
            tenantId
          );


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

    const currentUser =
      await requireRole(
      USER_MANAGEMENT_ROLES
      );

    if (!canManageUsers(currentUser)) {
      return NextResponse.json(
        {
          success: false,
          message: "You do not have permission to manage organization users.",
        },
        { status: 403 }
      );
    }

    const scope =
      request.nextUrl.searchParams.get(
        "scope"
      )?.trim();

    const platformScope =
      scope === PLATFORM_SCOPE;

    if (
      platformScope &&
      currentUser.role !== UserRole.SUPER_ADMIN
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Only a super administrator can use the platform users scope",
        },
        {
          status: 403,
        }
      );
    }

    const schema =
      platformScope
        ? PlatformCreateUserSchema
        : CreateTenantUserSchema;

    const body =
      await request.json();

    const parsed =
      schema.safeParse(body);


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


    if (
      !platformScope &&
      parsed.data.role ===
        UserRole.SUPER_ADMIN
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tenant administrators cannot create super administrators",
        },
        {
          status: 403,
        }
      );
    }

    const tenantId =
      platformScope
        ? null
        : currentUser.tenantId?.trim() ??
          "";

    if (
      !platformScope &&
      !tenantId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Authenticated tenant is required to create a tenant user",
        },
        {
          status: 403,
        }
      );
    }

    const user =
      await UserService.createUser(
        parsed.data,
        {
          tenantId:
            platformScope
              ? null
              : tenantId,
        }
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
