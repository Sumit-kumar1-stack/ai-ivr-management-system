import {
  AccountStatus,
  TenantStatus,
  UserRole,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  AUTH_COOKIE_NAME,
} from "@/lib/auth-constants";

import {
  hasAnyCampaignCapability,
  hasCampaignCapability,
  type CampaignCapability,
} from "@/services/communication/campaign-capabilities";

import {
  verifyToken,
} from "@/lib/jwt";

export {
  AUTH_COOKIE_NAME,
} from "@/lib/auth-constants";

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  campaignCapabilities?: readonly CampaignCapability[];
  phone: string | null;
  avatar: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantStatus: TenantStatus | null;
  accountStatus: AccountStatus;
  isActive: boolean;
}

function isLoginEligibleTenantStatus(
  status: TenantStatus
) {
  return (
    status === TenantStatus.ACTIVE ||
    status === TenantStatus.TRIAL
  );
}


export class AuthenticationError
  extends Error {

  readonly statusCode =
    401;

  constructor(
    message =
      "Authentication required"
  ) {

    super(
      message
    );

    this.name =
      "AuthenticationError";

  }

}


export class AuthorizationError
  extends Error {

  readonly statusCode =
    403;

  constructor(
    message =
      "You do not have permission to perform this action"
  ) {

    super(
      message
    );

    this.name =
      "AuthorizationError";

  }

}


//--------------------------------------------------
// Get Current User Without Throwing
//--------------------------------------------------

export async function getCurrentUser():
  Promise<
    AuthenticatedUser |
    null
  > {

  try {

    /*
     * Import request-bound Next APIs only when the
     * auth helper is executing inside a live
     * request render. This keeps the module safe to
     * load during custom-server/bootstrap phases.
     */
    const {
      cookies,
    } =
      await import(
        "next/headers"
      );

    const cookieStore =
      await cookies();


    const token =
      cookieStore.get(
        AUTH_COOKIE_NAME
      )?.value;


    if (
      !token
    ) {
      return null;
    }


    const payload =
      verifyToken(
        token
      );


    const user =
      await prisma.user.findUnique({
        where: {
          id:
            payload.userId,
        },

        select: {
          id:
            true,

          fullName:
            true,

          email:
            true,

          role:
            true,

          campaignCapabilities:
            true,

          phone:
            true,

          avatar:
            true,

          tenantId:
            true,

          accountStatus:
            true,

          isActive:
            true,

          tenant: {
            select: {
              name:
                true,

              status:
                true,
            },
          },
        },
      });


    if (
      !user ||
      !user.isActive ||
      user.accountStatus !==
        AccountStatus.ACTIVE ||
      (
        user.tenant &&
        !isLoginEligibleTenantStatus(
          user.tenant.status
        )
      )
    ) {
      return null;
    }


    /*
     * The database is the source of truth for
     * the user's current role.
     *
     * A role may have changed after the JWT
     * was originally issued.
     */
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      campaignCapabilities:
        (user.campaignCapabilities ?? []) as CampaignCapability[],
      phone: user.phone,
      avatar: user.avatar,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
      tenantStatus: user.tenant?.status ?? null,
      accountStatus: user.accountStatus,
      isActive: user.isActive,
    };

  } catch {

    return null;

  }

}


//--------------------------------------------------
// Require Authenticated User
//--------------------------------------------------

export async function requireUser():
  Promise<AuthenticatedUser> {

  const user =
    await getCurrentUser();


  if (
    !user
  ) {
    throw new AuthenticationError();
  }


  return user;

}


//--------------------------------------------------
// Require One of the Allowed Roles
//--------------------------------------------------

export async function requireRole(
  allowedRoles:
    readonly UserRole[]
): Promise<AuthenticatedUser> {

  const user =
    await requireUser();


  if (
    !allowedRoles.includes(
      user.role
    )
  ) {
    throw new AuthorizationError();
  }


  return user;

}

export async function requireCampaignCapability(
  capability:
    CampaignCapability
): Promise<AuthenticatedUser> {
  const user =
    await requireUser();

  if (
    !hasCampaignCapability(
      user.campaignCapabilities,
      capability
    )
  ) {
    throw new AuthorizationError();
  }

  return user;
}

export async function requireAnyCampaignCapabilities(
  capabilities:
    readonly CampaignCapability[]
): Promise<AuthenticatedUser> {
  const user =
    await requireUser();

  if (
    !hasAnyCampaignCapability(
      user.campaignCapabilities,
      capabilities
    )
  ) {
    throw new AuthorizationError();
  }

  return user;
}


//--------------------------------------------------
// Identify Authentication Errors
//--------------------------------------------------

export function isAuthenticationError(
  error: unknown
): error is AuthenticationError {

  return error instanceof
    AuthenticationError;

}


export function isAuthorizationError(
  error: unknown
): error is AuthorizationError {

  return error instanceof
    AuthorizationError;

}
