import { NextResponse } from "next/server";

import { getConversation } from "@/services/conversations/conversation.service";

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

  const conversation =
    await getConversation(callId);

  return NextResponse.json(conversation);
}