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

import {
  PlatformUpdateUserSchema,
  UpdateTenantUserSchema,
} from "@/features/users/user.schema";

import {
  toUserResponse,
} from "@/features/users/user.mapper";

import {
  getDefaultCampaignCapabilitiesForRole,
} from "@/features/users/user-campaign-capabilities";
import { hasCampaignCapability } from "@/services/communication/campaign-capabilities";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

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
// Get User
//--------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const currentUser = await requireRole(
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

    const {
      id,
    } = await params;

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
      currentUser.tenantId?.trim() ?? "";

    if (
      scope !== PLATFORM_SCOPE &&
      !tenantId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Authenticated tenant is required to access tenant users",
        },
        {
          status: 403,
        }
      );
    }

    const user =
      scope === PLATFORM_SCOPE
        ? await UserRepository.findById(
            id
          )
        : await resolveTenantScopedUser(
            tenantId,
            id
          );

    if (!user) {
      return NextResponse.json(
        {
          message: "User not found",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      data: toUserResponse(user),
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
    const currentUser = await requireRole(
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

    const {
      id,
    } = await params;

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

    const tenantId =
      currentUser.tenantId?.trim() ?? "";

    if (
      !platformScope &&
      !tenantId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Authenticated tenant is required to update tenant users",
        },
        {
          status: 403,
        }
      );
    }

    const schema =
      platformScope
        ? PlatformUpdateUserSchema
        : UpdateTenantUserSchema;

    const body =
      await request.json();

    const parsed =
      schema.safeParse(body);

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

    const updated =
      platformScope
        ? await updatePlatformUser(
            id,
            parsed.data
          )
        : await updateTenantUser(
            tenantId,
            id,
            parsed.data
          );

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User updated successfully",
      data: toUserResponse(updated),
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
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const currentUser = await requireRole(
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

    const {
      id,
    } = await params;

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

    const tenantId =
      currentUser.tenantId?.trim() ?? "";

    if (
      !platformScope &&
      !tenantId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Authenticated tenant is required to delete tenant users",
        },
        {
          status: 403,
        }
      );
    }

    if (id === currentUser.id) {
      return NextResponse.json(
        {
          success: false,
          message: "You cannot delete your own account",
        },
        {
          status: 409,
        }
      );
    }

    const deleted =
      platformScope
        ? await deletePlatformUser(
            id
          )
        : await deleteTenantUser(
            tenantId,
            id
          );

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return handleRouteError(
      error,
      "Failed to delete user"
    );
  }
}

//--------------------------------------------------
// Scoped Helpers
//--------------------------------------------------

async function resolveTenantScopedUser(
  tenantId: string | null,
  id: string
) {
  const normalizedTenantId =
    tenantId?.trim() ?? "";

  if (!normalizedTenantId) {
    return null;
  }

  return UserRepository.findByIdForTenant(
    id,
    normalizedTenantId
  );
}

async function updateTenantUser(
  tenantId: string | null,
  id: string,
  data: {
    fullName?: string;
    phone?: string;
    avatar?: string;
    isActive?: boolean;
    role?: "ADMIN" | "AGENT";
  }
) {
  const normalizedTenantId =
    tenantId?.trim() ?? "";

  if (!normalizedTenantId) {
    return null;
  }

  const campaignCapabilities =
    data.role
      ? getDefaultCampaignCapabilitiesForRole(
          data.role
        )
      : undefined;

  return UserRepository.updateForTenant(
    id,
    normalizedTenantId,
    {
      ...data,
      campaignCapabilities,
    }
  );
}

async function updatePlatformUser(
  id: string,
  data: {
    fullName?: string;
    phone?: string;
    avatar?: string;
    isActive?: boolean;
    role?: "SUPER_ADMIN" | "ADMIN" | "AGENT";
  }
) {
  const existing =
    await UserRepository.findById(
      id
    );

  if (!existing) {
    return null;
  }

  const campaignCapabilities =
    data.role
      ? getDefaultCampaignCapabilitiesForRole(
          data.role
        )
      : undefined;

  const updated =
    await UserRepository.update(
      id,
      {
        ...data,
        campaignCapabilities,
      }
    );

  return updated;
}

async function deleteTenantUser(
  tenantId: string | null,
  id: string
) {
  const normalizedTenantId =
    tenantId?.trim() ?? "";

  if (!normalizedTenantId) {
    return null;
  }

  return UserRepository.deleteForTenant(
    id,
    normalizedTenantId
  );
}

async function deletePlatformUser(
  id: string
) {
  const existing =
    await UserRepository.findById(
      id
    );

  if (!existing) {
    return null;
  }

  return UserRepository.delete(id);
}

//--------------------------------------------------
// Shared Error Handler
//--------------------------------------------------

function handleRouteError(
  error: unknown,
  fallbackMessage: string
): NextResponse {
  const authResponse =
    createAuthErrorResponse(error);

  if (authResponse) {
    return authResponse;
  }

  console.error(fallbackMessage, error);

  return NextResponse.json(
    {
      success: false,
      message: fallbackMessage,
    },
    {
      status: 500,
    }
  );
}
