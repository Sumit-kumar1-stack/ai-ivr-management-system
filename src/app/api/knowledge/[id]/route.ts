import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function DELETE(
  request: Request,
  { params }: Params
) {

  const { id } = await params;

  await prisma.knowledgeDocument.delete({

    where: {
      id,
    },

  });

  return NextResponse.json({

    success: true,

  });

}