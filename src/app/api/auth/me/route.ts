import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const token =
      (await cookies()).get("token")
        ?.value;

    if (!token) {
      return NextResponse.json(
        null,
        { status: 401 }
      );
    }

    const payload =
      verifyToken(token) as {
        userId: string;
      };

    const user =
      await prisma.user.findUnique({
        where: {
          id: payload.userId,
        },
      });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      null,
      { status: 401 }
    );
  }
}