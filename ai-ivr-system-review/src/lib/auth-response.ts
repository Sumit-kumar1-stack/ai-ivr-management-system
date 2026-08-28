import {
  NextResponse,
} from "next/server";

import {
  isAuthenticationError,
  isAuthorizationError,
} from "@/lib/auth";


export function createAuthErrorResponse(
  error: unknown
): NextResponse | null {

  if (
    isAuthenticationError(
      error
    )
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          error.message,
      },
      {
        status:
          401,
      }
    );
  }


  if (
    isAuthorizationError(
      error
    )
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          error.message,
      },
      {
        status:
          403,
      }
    );
  }


  return null;

}