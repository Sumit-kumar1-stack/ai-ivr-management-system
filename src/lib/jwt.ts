import jwt, {
  type JwtPayload,
} from "jsonwebtoken";

import {
  UserRole,
} from "@prisma/client";


export type AuthTokenPayload =
  JwtPayload & {
    userId: string;
    role: UserRole;
  };


function getJwtSecret():
  string {

  const secret =
    process.env.JWT_SECRET;

  if (
    !secret ||
    secret.length < 32
  ) {
    throw new Error(
      "JWT_SECRET must be set to a value of at least 32 characters."
    );
  }

  return secret;
}


export function signToken(
  payload: {
    userId: string;
    role: UserRole;
  }
): string {

  return jwt.sign(
    payload,
    getJwtSecret(),
    {
      expiresIn:
        "8h",

      issuer:
        "ai-ivr-management-system",

      audience:
        "ai-ivr-dashboard",
    }
  );

}


export function verifyToken(
  token: string
): AuthTokenPayload {

  const payload =
    jwt.verify(
      token,
      getJwtSecret(),
      {
        issuer:
          "ai-ivr-management-system",

        audience:
          "ai-ivr-dashboard",
      }
    );


  if (
    typeof payload ===
    "string"
  ) {
    throw new Error(
      "Invalid authentication token"
    );
  }


  if (
    typeof payload.userId !==
    "string"
  ) {
    throw new Error(
      "Authentication token is missing userId"
    );
  }


  if (
    !Object.values(
      UserRole
    ).includes(
      payload.role as UserRole
    )
  ) {
    throw new Error(
      "Authentication token contains an invalid role"
    );
  }


  return payload as
    AuthTokenPayload;

}