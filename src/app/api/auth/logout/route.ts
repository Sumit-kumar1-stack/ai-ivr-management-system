import {
  NextResponse,
} from "next/server";

import {
  AUTH_COOKIE_NAME,
} from "@/lib/auth";


export async function POST() {

  const response =
    NextResponse.json({
      success:
        true,

      message:
        "Logged out successfully",
    });


  response.cookies.set(
    AUTH_COOKIE_NAME,
    "",
    {
      httpOnly:
        true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite:
        "lax",

      path:
        "/",

      expires:
        new Date(0),

      maxAge:
        0,
    }
  );


  return response;

}