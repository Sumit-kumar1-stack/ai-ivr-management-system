import {
  NextResponse,
} from "next/server";

import {
  prisma,
} from "@/lib/prisma";

import {
  comparePassword,
} from "@/lib/hash";

import {
  signToken,
} from "@/lib/jwt";

import {
  AUTH_COOKIE_NAME,
} from "@/lib/auth";

import {
  LoginSchema,
} from "@/features/auth/auth.schema";


export async function POST(
  request: Request
) {

  try {

    const body =
      await request.json();


    const parsed =
      LoginSchema.safeParse(
        body
      );


    if (
      !parsed.success
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Invalid input",
        },
        {
          status:
            400,
        }
      );
    }


    const {
      email,
      password,
    } = parsed.data;


    const user =
      await prisma.user.findUnique({
        where: {
          email,
        },
      });


    /*
     * Return the same message for missing users,
     * inactive users, and incorrect passwords.
     */
    if (
      !user ||
      !user.isActive
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Invalid credentials",
        },
        {
          status:
            401,
        }
      );
    }


    const validPassword =
      await comparePassword(
        password,
        user.password
      );


    if (
      !validPassword
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Invalid credentials",
        },
        {
          status:
            401,
        }
      );
    }


    const token =
      signToken({
        userId:
          user.id,

        role:
          user.role,
      });


    await prisma.user.update({
      where: {
        id:
          user.id,
      },

      data: {
        lastLogin:
          new Date(),
      },
    });


    const response =
      NextResponse.json({
        success:
          true,

        user: {
          id:
            user.id,

          email:
            user.email,

          role:
            user.role,

          fullName:
            user.fullName,
        },
      });


    response.cookies.set(
      AUTH_COOKIE_NAME,
      token,
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

        maxAge:
          60 *
          60 *
          8,
      }
    );


    return response;

  } catch (error) {

    console.error(
      "Login failed",
      {
        error:
          error instanceof Error
            ? error.message
            : String(
                error
              ),
      }
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Server error",
      },
      {
        status:
          500,
      }
    );

  }

}