import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticationError, isAuthorizationError, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCallOwnership } from "@/services/security/tenant-access.service";
import { listSafeTransferAudit } from "@/services/telephony/agent-transfer-persistence.service";
import { listTenantCallbacks } from "@/services/telephony/callback-request.service";
import { toSafeCallbackView } from "@/services/telephony/callback-safe-view.service";

const TRANSFER_READ_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT] as const;
type Context = { params: Promise<{ id: string }> };

/** Separate from general call timeline: this endpoint is a strict safe-field projection. */
export async function GET(_request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const user = await requireRole(TRANSFER_READ_ROLES);
    const callId = (await context.params).id.trim();
    if (!callId) return NextResponse.json({ success: false, message: "Call not found." }, { status: 404 });
    await assertCallOwnership(callId, user);
    const call = await prisma.call.findUnique({ where: { id: callId }, select: { tenantId: true } });
    if (!call?.tenantId) return NextResponse.json({ success: false, message: "Call not found." }, { status: 404 });
    const events = await listSafeTransferAudit(call.tenantId, callId);
    const callbacks = (await listTenantCallbacks(call.tenantId)).filter(item => (item.originalCallId ?? item.callId) === callId).map(toSafeCallbackView);
    return NextResponse.json({ success: true, data: { events: events.map(event => safeEvent(event)), callbacks } });
  } catch (error) {
    const status = isAuthenticationError(error) ? 401 : isAuthorizationError(error) ? 403 : 404;
    return NextResponse.json({ success: false, message: status === 401 ? "Authentication required." : "Call not found." }, { status });
  }
}

function safeEvent(event: { createdAt: Date; message: string | null; payload: unknown }) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
  const handoff = event.message === "Agent handoff context prepared" ? {
    department: stringValue(payload.department),
    intent: stringValue(payload.intent),
    language: stringValue(payload.language),
    conversationSummary: stringValue(payload.conversationSummary),
    sentiment: stringValue(payload.sentiment),
    callbackEligible: Boolean(payload.callbackEligible),
  } : null;
  return {
    createdAt: event.createdAt,
    message: event.message,
    status: stringValue(payload.stage),
    provider: stringValue(payload.provider),
    destinationLabel: stringValue(payload.destinationLabel),
    handoff,
  };
}
function stringValue(value: unknown): string | null { return typeof value === "string" ? value : null; }
