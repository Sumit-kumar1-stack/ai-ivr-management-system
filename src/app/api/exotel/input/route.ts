import { NextRequest, NextResponse } from "next/server";
import { createServerLogger, normalizeError } from "@/lib/logger";
import { createExotelAuthErrorResponse, validateExotelWebhook } from "@/lib/exotel-webhook-auth";
import { ExotelProvider, normalizeExotelInboundPayload } from "@/providers/telephony/exotel.provider";
import { prisma } from "@/lib/prisma";
import { routeRealtimeCallInput } from "@/services/conversations/realtime-input.service";
import { exomlResponse } from "../inbound/route";

const log = createServerLogger("exotel-input-route");

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validateExotelWebhook(request);
    const callId = request.nextUrl.searchParams.get("callId")?.trim();
    const providerCallId = normalizeExotelInboundPayload(payload).providerCallId;
    const digit = new ExotelProvider().normalizeDtmf(payload.Digits ?? payload.digits ?? payload.digit);
    if (!callId || !providerCallId || !digit) return NextResponse.json({ success: false, message: "Call ID, provider call ID, and one DTMF digit are required" }, { status: 400 });
    const call = await prisma.call.findFirst({ where: { id: callId, providerCallId, provider: "EXOTEL" }, select: { id: true, tenantId: true } });
    if (!call) return new NextResponse("Forbidden", { status: 403 });
    const routed = await routeRealtimeCallInput({ type: "DTMF", callId: call.id, provider: "EXOTEL", digit, timestamp: Date.now() }, { deliverOutput: false });
    const execution = routed.graphExecution;
    log.info({ event: "exotel.dtmf.received", providerCallId, internalCallId: call.id, tenantId: call.tenantId, digit, matched: routed.handled, durationMs: 0 }, "Exotel DTMF routed through provider-neutral realtime input");
    return exomlResponse(routed.speechText ?? "I did not understand that selection.", routed.endCall, request.nextUrl, call.id, execution ?? undefined);
  } catch (error) {
    const auth = createExotelAuthErrorResponse(error);
    if (auth) return auth;
    log.error({ event: "exotel.dtmf.failed", error: normalizeError(error) }, "Exotel DTMF webhook failed");
    return NextResponse.json({ success: false, message: "Failed to process DTMF" }, { status: 500 });
  }
}
