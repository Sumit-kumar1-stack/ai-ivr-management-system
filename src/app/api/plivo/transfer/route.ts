import { NextRequest, NextResponse } from "next/server";
import { createPlivoAuthErrorResponse, validatePlivoWebhook } from "@/lib/plivo-webhook-auth";
import { getPlivoPublicCallbackUrl } from "@/lib/plivo-public-url";
import { prisma } from "@/lib/prisma";
import { createServerLogger, normalizeError } from "@/lib/logger";
import { normalizePlivoInboundPayload } from "@/providers/telephony/plivo.provider";
import { getHumanTransferState, markHumanTransferDialing } from "@/services/telephony/human-transfer-lifecycle.service";
import { persistTransferLifecycle } from "@/services/telephony/agent-transfer-persistence.service";

const log = createServerLogger("plivo-transfer-route");

/** The signed A-leg URL configured through Plivo's active-call Transfer API. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validatePlivoWebhook(request);
    const callId = request.nextUrl.searchParams.get("callId")?.trim();
    const providerCallId = normalizePlivoInboundPayload(payload).providerCallId;
    if (!callId || !providerCallId) return xml("<Response><Hangup/></Response>", 400);
    const call = await prisma.call.findFirst({ where: { id: callId, provider: "PLIVO", providerCallId }, select: { id: true } });
    const transfer = call ? await getHumanTransferState(call.id) : null;
    if (!call || !transfer?.destination) return xml("<Response><Hangup/></Response>", 403);

    await markHumanTransferDialing(call.id);
    await persistTransferLifecycle(call.id, "DIALING", { provider: "PLIVO" });
    const action = getPlivoPublicCallbackUrl("/api/plivo/transfer/status", { callId: call.id }).toString();
    const callback = getPlivoPublicCallbackUrl("/api/plivo/transfer/status", { callId: call.id }).toString();
    const destinationTag = /^sips?:/i.test(transfer.destination) ? "User" : "Number";
    log.info({ event: "agent.transfer.started", callId: call.id, provider: "PLIVO", destinationType: destinationTag.toUpperCase() }, "Plivo transferred A-leg to human handoff XML");
    return xml(`<Response><Dial action="${escapeXml(action)}" method="POST" callbackUrl="${escapeXml(callback)}" callbackMethod="POST" timeout="30" redirect="true"><${destinationTag}>${escapeXml(transfer.destination)}</${destinationTag}></Dial></Response>`);
  } catch (error) {
    const auth = createPlivoAuthErrorResponse(error);
    if (auth) return auth;
    log.error({ event: "agent.transfer.failed", error: normalizeError(error) }, "Plivo transfer XML failed");
    return xml("<Response><Hangup/></Response>", 500);
  }
}

function xml(body: string, status = 200): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { status, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
}
function escapeXml(value: string): string { return value.replace(/[<>&'\"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[char] ?? char); }
