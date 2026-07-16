import jwt, { type JwtPayload } from "jsonwebtoken";

export type AuthTokenPayload = JwtPayload & {
  userId: string;
  role: string;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to a value of at least 32 characters.");
  }

  return secret;
}

export function signToken(payload: {
  userId: string;
  role: string;
}): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "8h",
    issuer: "ai-ivr-management-system",
    audience: "ai-ivr-dashboard",
  });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getJwtSecret(), {
    issuer: "ai-ivr-management-system",
    audience: "ai-ivr-dashboard",
  }) as AuthTokenPayload;
}
