import { NextResponse } from "next/server";

import {
  ConversationService,
} from "@/services/conversations/conversation.service";

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

interface Params {
  params: Promise<{
    callId: string;
  }>;
}

export async function GET(
  request: Request,
  { params }: Params
) {
  const { callId } = await params;

  const messages =
    await ConversationService.getConversation(
      callId
    );

  return NextResponse.json({
    success: true,
    data: messages,
  });
}

export async function POST(
  request: Request,
  { params }: Params
) {
  const { callId } = await params;

  const body = await request.json();

  const reply =
    await processUserMessage(
      callId,
      body.message
    );

  return NextResponse.json({
    success: true,
    reply,
  });
}