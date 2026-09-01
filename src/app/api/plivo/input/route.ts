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
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validatePlivoWebhook(request);
    const callId = request.nextUrl.searchParams.get("callId")?.trim();
    const providerCallId = normalizePlivoInboundPayload(payload).providerCallId;
    const timeout = request.nextUrl.searchParams.get("timeout") === "1";
    const digit = new PlivoProvider().normalizeDtmf(payload.Digits ?? payload.digits);
    const speech = typeof payload.Speech === "string" ? payload.Speech.trim() : "";

    if (!callId || !providerCallId || (!timeout && !digit && !speech)) {
      return NextResponse.json(
        { success: false, message: "Call ID, CallUUID, and DTMF, speech, or a signed timeout are required" },
        { status: 400 }
      );
    }

    const call = await prisma.call.findFirst({
      where: { id: callId, providerCallId, provider: "PLIVO" },
      select: { id: true, tenantId: true, requestedRuntime: true },
    });
    if (!call) return new NextResponse("Forbidden", { status: 403 });

    const t0 = Date.now();
    log.info({
      event: "input.received",
      internalCallId: call.id,
      tenantId: call.tenantId,
      inputType: timeout ? "SILENCE" : speech ? "VOICE" : "DTMF",
    }, "Plivo input received");

    const timestamp = t0;
    const input = timeout
      ? { type: "SILENCE" as const, callId: call.id, provider: "PLIVO" as const, durationMs: 0, timestamp }
      : speech
        ? {
            type: "VOICE" as const,
            callId: call.id,
            provider: "PLIVO" as const,
            text: speech,
            isFinal: true,
            confidence: numericValue(payload.SpeechConfidenceScore),
            timestamp,
          }
        : { type: "DTMF" as const, callId: call.id, provider: "PLIVO" as const, digit: digit!, timestamp };
    const routed = await routeRealtimeCallInput(input, { deliverOutput: false });
    const t1 = Date.now();
    const execution = routed.graphExecution;

    log.info({
      event: timeout ? "plivo.entry_input.timeout_received" : speech ? "plivo.entry_input.speech_received" : "plivo.entry_input.digit_received",
      providerCallId,
      internalCallId: call.id,
      tenantId: call.tenantId,
      inputType: timeout ? "SILENCE" : speech ? "VOICE" : "DTMF",
      matched: routed.handled,
      durationMs: t1 - t0,
      currentIvrNodeId: execution?.currentNodeId ?? null,
      transitionReason: execution?.transitionReason ?? null,
    }, "input.normalized — menu.matched — graph.transition.completed");

    if (!routed.handled) {
      log.info({ event: "plivo.entry_input.invalid", internalCallId: call.id, currentIvrNodeId: execution?.currentNodeId ?? null, elapsedMs: t1 - t0 }, "Plivo XML entry input was not matched");
    } else {
      log.info({ event: "plivo.entry_input.resolved", internalCallId: call.id, selectedIntent: routed.intent?.intent ?? null, currentIvrNodeId: execution?.currentNodeId ?? null, elapsedMs: t1 - t0 }, "Plivo XML entry input resolved");
    }
    const response = plivoXmlResponse(routed.speechText ?? "I did not understand that selection.", routed.endCall, request.nextUrl, call.id, execution ?? undefined, call.requestedRuntime ?? undefined);
    log.info({ event: "request.completed", internalCallId: call.id, totalDurationMs: Date.now() - t0 }, "Plivo input request completed");
    return response;
  } catch (error) {
    const auth = createPlivoAuthErrorResponse(error);
    if (auth) return auth;
    log.error({ event: "plivo.input.failed", error: normalizeError(error) }, "Plivo input webhook failed");
    return NextResponse.json({ success: false, message: "Failed to process input" }, { status: 500 });
  }
}

function numericValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}
