import { NextResponse } from "next/server";

import { UserRole } from "@prisma/client";

import {
  ConversationService,
} from "@/services/conversations/conversation.service";

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

import {
  requireRole,
} from "@/lib/auth";

import {
  assertCallOwnership,
} from "@/services/security/tenant-access.service";

interface Params {
  params: Promise<{
    callId: string;
  }>;
}

export async function GET(
  request: Request,
  { params }: Params
) {
  const currentUser = await requireRole([
    UserRole.AGENT,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ]);

  const { callId } = await params;

  await assertCallOwnership(
    callId,
    currentUser
  );

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
  const currentUser = await requireRole([
    UserRole.AGENT,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ]);

  const { callId } = await params;

  await assertCallOwnership(
    callId,
    currentUser
  );

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
