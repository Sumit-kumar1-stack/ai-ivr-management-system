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

    const payload = verifyToken(token);

    const user =
      await prisma.user.findUnique({
        where: {
          id: payload.userId,
        },
      });

    if (!user || !user.isActive) {
      return NextResponse.json(null, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      phone: user.phone,
      avatar: user.avatar,
      isActive: user.isActive,
    });
  } catch {
    return NextResponse.json(
      null,
      { status: 401 }
    );
  }
}
