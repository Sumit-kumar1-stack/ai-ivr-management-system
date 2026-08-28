import { NextRequest, NextResponse } from "next/server";
import { chatWithAI } from "@/services/ai/ai-chat.service";

export async function POST(
  req: NextRequest
) {
  try {
    const body = await req.json();

    const reply = await chatWithAI(
      body.callId,
      body.message
    );

    return NextResponse.json({
      success: true,
      reply,
    });
  } catch {
    console.error("AI chat request failed");

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}
