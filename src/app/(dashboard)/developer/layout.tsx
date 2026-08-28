import type { ReactNode } from "react";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { requireRole } from "@/lib/auth";

const DEVELOPER_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AuthenticationErrorLike = Error & {
  statusCode?: number;
};

function isAuthenticationError(
  error: unknown,
): error is AuthenticationErrorLike {
  if (!(error instanceof Error)) {
    return false;
  }

  const authError = error as AuthenticationErrorLike;

  return (
    authError.statusCode === 401 ||
    authError.name === "AuthenticationError"
  );
}

export default async function DeveloperLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  // Next.js 16:
  // Explicitly bind this protected route tree to an incoming request.
  // Everything below this point is excluded from prerendering.
  await connection();

  try {
    await requireRole(DEVELOPER_ROLES);
  } catch (error) {
    if (isAuthenticationError(error)) {
      redirect("/login");
    }

    throw error;
  }

  return <>{children}</>;
}