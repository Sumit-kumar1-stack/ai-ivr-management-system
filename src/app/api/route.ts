import { NextResponse } from "next/server";
import { buildKnowledgeContext } from "@/services/knowledge/rag.service";

export async function GET() {

  const context =
    await buildKnowledgeContext(
      "What is loan interest?"
    );

  return NextResponse.json({
    context,
  });

}