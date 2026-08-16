import {
  UserRole,
} from "@prisma/client";

import type {
  Socket,
} from "socket.io";

import {
  AUTH_COOKIE_NAME,
} from "@/lib/auth-constants";

import {
  verifyToken,
} from "@/lib/jwt";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface AuthenticatedSocketUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface SocketAuthenticationResult {
  user: AuthenticatedSocketUser;
}

//--------------------------------------------------
// Allowed Roles
//--------------------------------------------------

const ALLOWED_SOCKET_ROLES:
  readonly UserRole[] = [
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ];

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "socket-auth"
  );

//--------------------------------------------------
// Authenticate Socket
//--------------------------------------------------

export async function authenticateSocket(
  socket: Socket
): Promise<SocketAuthenticationResult> {
  validateSocketOrigin(
    socket
  );

  const cookieHeader =
    socket.handshake
      .headers
      .cookie;

  const token =
    readCookie(
      cookieHeader,
      AUTH_COOKIE_NAME
    );

  if (
    !token
  ) {
    throw new Error(
      "Authentication cookie is missing"
    );
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

        isActive:
          true,
      },
    });

  if (
    !user
  ) {
    throw new Error(
      "Authenticated user was not found"
    );
  }

  if (
    !user.isActive
  ) {
    throw new Error(
      "Authenticated user is inactive"
    );
  }

  if (
    !ALLOWED_SOCKET_ROLES.includes(
      user.role
    )
  ) {
    throw new Error(
      "User is not authorized to access dashboard realtime events"
    );
  }

  return {
    user: {
      id:
        user.id,

      fullName:
        user.fullName,

      email:
        user.email,

      role:
        user.role,
    },
  };
}

//--------------------------------------------------
// Origin Validation
//--------------------------------------------------

export function validateSocketOrigin(
  socket: Socket
): void {
  const origin =
    socket.handshake
      .headers
      .origin;

  const allowedOrigins =
    getAllowedSocketOrigins();

  /*
   * Some non-browser clients may omit Origin.
   * In production, reject missing origins.
   */
  if (
    !origin
  ) {
    if (
      process.env.NODE_ENV ===
      "production"
    ) {
      throw new Error(
        "Socket origin is missing"
      );
    }

    return;
  }

  if (
    !allowedOrigins.has(
      normalizeOrigin(
        origin
      )
    )
  ) {
    throw new Error(
      "Socket origin is not allowed"
    );
  }
}

//--------------------------------------------------
// Allowed Origin Configuration
//--------------------------------------------------

export function getAllowedSocketOrigins():
  Set<string> {
  const configuredOrigins =
    process.env
      .SOCKET_ALLOWED_ORIGINS
      ?.split(",")
      .map(
        value =>
          value.trim()
      )
      .filter(
        Boolean
      ) ??
    [];

  const origins =
    new Set<string>();

  for (
    const origin of
    configuredOrigins
  ) {
    origins.add(
      normalizeOrigin(
        origin
      )
    );
  }

  if (
    process.env.NODE_ENV !==
      "production"
  ) {
    origins.add(
      "http://localhost:3000"
    );

    origins.add(
      "http://127.0.0.1:3000"
    );
  }

  if (
    origins.size ===
    0
  ) {
    throw new Error(
      "SOCKET_ALLOWED_ORIGINS must contain at least one allowed origin"
    );
  }

  return origins;
}

//--------------------------------------------------
// Cookie Parser
//--------------------------------------------------

function readCookie(
  cookieHeader:
    | string
    | undefined,
  cookieName: string
): string | null {
  if (
    !cookieHeader
  ) {
    return null;
  }

  const cookies =
    cookieHeader.split(
      ";"
    );

  for (
    const cookie of
    cookies
  ) {
    const separatorIndex =
      cookie.indexOf(
        "="
      );

    if (
      separatorIndex <
      0
    ) {
      continue;
    }

    const name =
      cookie
        .slice(
          0,
          separatorIndex
        )
        .trim();

    if (
      name !==
      cookieName
    ) {
      continue;
    }

    const value =
      cookie
        .slice(
          separatorIndex +
            1
        )
        .trim();

    if (
      !value
    ) {
      return null;
    }

    try {
      return decodeURIComponent(
        value
      );
    } catch (
      error
    ) {
      log.warn(
        {
          event:
            "socket.auth.cookie_decode_failed",

          error:
            normalizeError(
              error
            ),
        },
        "Socket authentication cookie could not be decoded"
      );

      return null;
    }
  }

  return null;
}

//--------------------------------------------------
// Normalize Origin
//--------------------------------------------------

function normalizeOrigin(
  value: string
): string {
  try {
    const url =
      new URL(
        value
      );

    return url.origin;
  } catch {
    throw new Error(
      "Invalid socket origin configuration"
    );
  }
}