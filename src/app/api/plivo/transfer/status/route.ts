import { NextRequest, NextResponse } from "next/server";
import { createPlivoAuthErrorResponse, validatePlivoWebhook } from "@/lib/plivo-webhook-auth";
import { createServerLogger, normalizeError } from "@/lib/logger";
import { applyHumanTransferProviderEvent } from "@/services/telephony/human-transfer-lifecycle.service";
import { persistCallbackFollowUpOffer, persistTransferLifecycle } from "@/services/telephony/agent-transfer-persistence.service";
import { prisma } from "@/lib/prisma";
import { normalizePlivoInboundPayload } from "@/providers/telephony/plivo.provider";

const log = createServerLogger("plivo-transfer-status-route");

/** Receives documented <Dial> callback/action evidence for the human B-leg. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validatePlivoWebhook(request);
    const callId = request.nextUrl.searchParams.get("callId")?.trim();
    const providerCallId = normalizePlivoInboundPayload(payload).providerCallId;
    const childProviderCallId = text(payload.DialBLegUUID ?? payload.DialBLegUuid ?? payload.CallUUID);
    const status = mapStatus(text(payload.DialAction), text(payload.DialStatus));
    if (!callId || !providerCallId || !childProviderCallId || !status) return NextResponse.json({ success: false, message: "Transfer callback lacks required evidence" }, { status: 400 });
    const call = await prisma.call.findFirst({ where: { id: callId, provider: "PLIVO", providerCallId }, select: { id: true, inboundProfile: { select: { callbackEnabled: true } } } });
    if (!call) return NextResponse.json({ success: false, message: "Transfer callback does not match its active Plivo call" }, { status: 403 });
    const result = await applyHumanTransferProviderEvent({ callId, provider: "PLIVO", childProviderCallId, status, failureCode: status === "FAILED" ? text(payload.DialHangupCause) ?? "PLIVO_DIAL_FAILED" : undefined });
    if (result.applied) {
      const stage = status === "ANSWERED" ? "CONNECTED" : status === "COMPLETED" ? "COMPLETED" : status === "FAILED" ? failureStage(payload) : "DIALING";
      await persistTransferLifecycle(callId, stage, { provider: "PLIVO" });
      if (status === "FAILED" && call.inboundProfile?.callbackEnabled !== false) await persistCallbackFollowUpOffer(callId, failureStage(payload));
    }
    log.info({ event: status === "ANSWERED" ? "agent.transfer.completed" : status === "FAILED" ? "agent.transfer.failed" : "agent.transfer.started", callId, provider: "PLIVO", applied: result.applied }, "Plivo transfer callback processed");
    return NextResponse.json({ success: true, applied: result.applied });
  } catch (error) {
    const auth = createPlivoAuthErrorResponse(error);
    if (auth) return auth;
    log.error({ event: "agent.transfer.failed", error: normalizeError(error) }, "Plivo transfer callback failed");
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function mapStatus(action: string | null, dialStatus: string | null): "DIALING" | "ANSWERED" | "FAILED" | "COMPLETED" | null {
  const token = (action ?? dialStatus ?? "").toLowerCase();
  if (token === "ringing") return "DIALING";
  // Dial callbacks, unlike the initial A-leg API acceptance, are authoritative
  // evidence that the B-leg connected to a human.
  if (token === "connected") return "ANSWERED";
  if (token === "answer") return "ANSWERED";
  if (["completed", "hangup"].includes(token) && dialStatus === "completed") return "COMPLETED";
  if (["failed", "busy", "cancel", "timeout", "no-answer", "hangup"].includes(token)) return "FAILED";
  return null;
}
function failureStage(payload: Record<string, unknown>): "NO_ANSWER" | "BUSY" | "FAILED" {
  const status = text(payload.DialStatus)?.toLowerCase();
  return status === "no-answer" || status === "timeout" ? "NO_ANSWER" : status === "busy" ? "BUSY" : "FAILED";
}
