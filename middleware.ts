import { NextRequest, NextResponse } from "next/server";

const publicRoutes = [
  "/login",
  "/api/auth/login",
];

export function middleware(
  request: NextRequest
) {
  const token =
    request.cookies.get("token");

  const path =
    request.nextUrl.pathname;

  const isPublic =
    publicRoutes.some(route =>
      path.startsWith(route)
    );

  if (!token && !isPublic) {
    return NextResponse.redirect(
      new URL(
        "/login",
        request.url
      )
    );
  }

  if (token && path === "/login") {
    return NextResponse.redirect(
      new URL(
        "/dashboard",
        request.url
      )
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};