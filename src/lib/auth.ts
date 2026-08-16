import {
  cookies,
} from "next/headers";

import {
  UserRole,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  AUTH_COOKIE_NAME,
} from "@/lib/auth-constants";

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
  phone: string | null;
  avatar: string | null;
  isActive: boolean;
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

          phone:
            true,

          avatar:
            true,

          isActive:
            true,
        },
      });


    if (
      !user ||
      !user.isActive
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
    return user;

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