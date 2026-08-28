import { NextRequest, NextResponse } from "next/server";
import { createServerLogger, normalizeError } from "@/lib/logger";
import { createPlivoAuthErrorResponse, validatePlivoWebhook } from "@/lib/plivo-webhook-auth";
import { normalizePlivoInboundPayload, PlivoProvider } from "@/providers/telephony/plivo.provider";
import { prisma } from "@/lib/prisma";
import { routeRealtimeCallInput } from "@/services/conversations/realtime-input.service";
import { plivoXmlResponse } from "../inbound/route";

/**
 * Adapter for Plivo's XML GetDigits/GetInput action callback. The Gemini Live
 * <Stream> answer does not emit this verb, so this route is intentionally not
 * a delivery path for keypad input during an active Plivo media stream.
 */
const log = createServerLogger("plivo-input-route");
export async function POST(request: NextRequest): Promise<NextResponse> { try { const payload = await validatePlivoWebhook(request); const callId = request.nextUrl.searchParams.get("callId")?.trim(); const providerCallId = normalizePlivoInboundPayload(payload).providerCallId; const digit = new PlivoProvider().normalizeDtmf(payload.Digits ?? payload.digits); if (!callId || !providerCallId || !digit) return NextResponse.json({ success: false, message: "Call ID, CallUUID, and one DTMF digit are required" }, { status: 400 }); const call = await prisma.call.findFirst({ where: { id: callId, providerCallId, provider: "PLIVO" }, select: { id: true, tenantId: true, requestedRuntime: true } }); if (!call) return new NextResponse("Forbidden", { status: 403 }); const routed = await routeRealtimeCallInput({ type: "DTMF", callId: call.id, provider: "PLIVO", digit, timestamp: Date.now() }, { deliverOutput: false }); const execution = routed.graphExecution; log.info({ event: "plivo.entry_input.digit_received", providerCallId, internalCallId: call.id, tenantId: call.tenantId, digit, matched: routed.handled, durationMs: 0 }, "Plivo XML entry digit routed through provider-neutral input"); if (!routed.handled) log.info({ event: "plivo.entry_input.invalid", internalCallId: call.id, currentIvrNodeId: execution?.currentNodeId ?? null }, "Plivo XML entry input was not matched"); else log.info({ event: "plivo.entry_input.resolved", internalCallId: call.id, selectedIntent: routed.intent?.intent ?? null, currentIvrNodeId: execution?.currentNodeId ?? null }, "Plivo XML entry input resolved"); return plivoXmlResponse(routed.speechText ?? "I did not understand that selection.", routed.endCall, request.nextUrl, call.id, execution ?? undefined, call.requestedRuntime ?? undefined); } catch (error) { const auth = createPlivoAuthErrorResponse(error); if (auth) return auth; log.error({ event: "plivo.dtmf.failed", error: normalizeError(error) }, "Plivo DTMF webhook failed"); return NextResponse.json({ success: false, message: "Failed to process DTMF" }, { status: 500 }); } }
