import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search");

  const documents =
    await prisma.knowledgeDocument.findMany({
      where: search
        ? {
            originalName: {
              contains: search,
              mode: "insensitive",
            },
          }
        : {},

      include: {
        chunks: true,
      },

      orderBy: {
        uploadedAt: "desc",
      },
    });

  return NextResponse.json({
    success: true,
    data: documents,
  });
}