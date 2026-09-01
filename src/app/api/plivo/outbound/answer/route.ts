import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  createPlivoAuthErrorResponse,
  validatePlivoWebhook,
} from "@/lib/plivo-webhook-auth";
import { normalizeError, createServerLogger } from "@/lib/logger";
import { normalizePlivoInboundPayload } from "@/providers/telephony/plivo.provider";
import { plivoXmlResponse } from "@/app/api/plivo/inbound/route";
import { processOutboundPlivoLifecycle } from "@/services/communication/communication-outbound-lifecycle.service";
import { startIVRGraphExecution } from "@/services/ivr/ivr-graph-executor.service";
import { startPlivoRecordingIfNeeded } from "@/services/telephony/plivo-recording.service";

const log = createServerLogger("plivo-outbound-answer-route");

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validatePlivoWebhook(request);
    const attemptId = request.nextUrl.searchParams.get("attempt")?.trim() ?? "";
    const providerCallId = normalizePlivoInboundPayload(payload).providerCallId ?? "";
    if (!attemptId || !providerCallId) {
      return plivoXmlResponse("The call session could not be verified.", true, request.nextUrl);
    }

    const lifecycle = await processOutboundPlivoLifecycle({
      attemptId,
      providerCallId,
      rawStatus: "answered",
    });
    if (!lifecycle.matched || lifecycle.conflict || !lifecycle.callId) {
      return plivoXmlResponse("The call session could not be verified.", true, request.nextUrl);
    }

    await startPlivoRecordingIfNeeded(lifecycle.callId, providerCallId);

    const call = await prisma.call.findUnique({
      where: { id: lifecycle.callId },
      select: { requestedRuntime: true },
    });
    const execution = await startIVRGraphExecution(lifecycle.callId);
    return plivoXmlResponse(
      execution.speechText ?? "Welcome.",
      execution.endCall,
      request.nextUrl,
      lifecycle.callId,
      execution,
      call?.requestedRuntime ?? undefined
    );
  } catch (error) {
    const auth = createPlivoAuthErrorResponse(error);
    if (auth) return auth;
    log.error(
      { event: "plivo.outbound.answer_failed", error: normalizeError(error) },
      "Plivo outbound Answer callback failed"
    );
    return plivoXmlResponse("A call initialization error occurred.", true, request.nextUrl);
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { success: false, message: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
