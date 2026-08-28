import { NextRequest, NextResponse } from "next/server";
import { createServerLogger, maskPhoneNumber, normalizeError } from "@/lib/logger";
import { createExotelAuthErrorResponse, validateExotelWebhook } from "@/lib/exotel-webhook-auth";
import { normalizeExotelInboundPayload } from "@/providers/telephony/exotel.provider";
import { createOrGetInboundCall } from "@/services/calls/inbound-call.service";
import { resolveActiveInboundConfiguration } from "@/services/calls/inbound-number.service";
import { startIVRGraphExecution, type IVRGraphExecutionResult } from "@/services/ivr/ivr-graph-executor.service";
import { prisma } from "@/lib/prisma";

const log = createServerLogger("exotel-inbound-route");

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validateExotelWebhook(request);
    const inbound = normalizeExotelInboundPayload(payload);
    if (!inbound.providerCallId || !inbound.callerNumber || !inbound.calledNumber) {
      return exomlResponse("We could not initialize your call.", true, request.nextUrl);
    }
    const requestedCallId = request.nextUrl.searchParams.get("callId")?.trim();
    // Outbound Voice v1 callbacks carry our signed internal identifier. They
    // must use the already-created campaign call, not an inbound-number profile.
    if (requestedCallId) {
      const outbound = await prisma.call.findFirst({ where: { id: requestedCallId, provider: "EXOTEL" }, select: { id: true, tenantId: true } });
      if (!outbound) return exomlResponse("The call session could not be verified.", true, request.nextUrl);
      const execution = await startIVRGraphExecution(outbound.id);
      log.info({ event: "exotel.inbound.received", providerCallId: inbound.providerCallId, internalCallId: outbound.id, tenantId: outbound.tenantId, direction: "OUTBOUND", durationMs: 0 }, "Exotel outbound call-control request initialized");
      return exomlResponse(execution.speechText ?? "Welcome.", execution.endCall, request.nextUrl, outbound.id, execution);
    }
    const configuration = await resolveActiveInboundConfiguration({ provider: "EXOTEL", calledNumber: inbound.calledNumber });
    if (!configuration.configured) {
      log.warn({ event: "exotel.inbound.unconfigured_number", calledNumber: maskPhoneNumber(inbound.calledNumber), reason: configuration.reason }, "Exotel inbound number is not configured");
      return exomlResponse("This number is not available for incoming calls right now.", true, request.nextUrl);
    }
    const call = await createOrGetInboundCall({
      provider: "EXOTEL",
      providerCallId: inbound.providerCallId,
      callerNumber: inbound.callerNumber,
      calledNumber: inbound.calledNumber,
      language: configuration.configuration.defaultLanguage,
      tenantId: configuration.configuration.tenantId,
      inboundProfileId: configuration.configuration.inboundProfileId,
      ivrFlowVersionId: configuration.configuration.ivrFlowVersionId,
      requestedRuntime: configuration.configuration.requestedRuntime,
    });
    const execution = await startIVRGraphExecution(call.callId);
    log.info({ event: "exotel.inbound.received", providerCallId: inbound.providerCallId, internalCallId: call.callId, tenantId: call.tenantId, durationMs: 0 }, "Exotel inbound call initialized");
    return exomlResponse(execution.speechText ?? "Welcome.", execution.endCall, request.nextUrl, call.callId, execution);
  } catch (error) {
    const auth = createExotelAuthErrorResponse(error);
    if (auth) return auth;
    log.error({ event: "exotel.inbound.failed", error: normalizeError(error) }, "Exotel inbound webhook failed");
    return exomlResponse("A call initialization error occurred.", true, request.nextUrl);
  }
}

export async function GET(): Promise<NextResponse> { return NextResponse.json({ success: false, message: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } }); }

export function exomlResponse(speech: string, endCall: boolean, baseUrl: URL, callId?: string, execution?: IVRGraphExecutionResult): NextResponse {
  const safeSpeech = escapeXml(speech);
  const inputUrl = callId ? new URL("/api/exotel/input", baseUrl) : null;
  if (inputUrl) {
    inputUrl.searchParams.set("callId", callId!);
    const token = baseUrl.searchParams.get("token");
    if (token) inputUrl.searchParams.set("token", token);
  }
  const xml = endCall
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${safeSpeech}</Say><Hangup/></Response>`
    : execution?.awaitInput && inputUrl
      ? `<?xml version="1.0" encoding="UTF-8"?><Response><Gather action="${escapeXml(inputUrl.toString())}" method="POST" numDigits="1" timeout="8"><Say>${safeSpeech}</Say></Gather></Response>`
      : `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${safeSpeech}</Say></Response>`;
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
}

function escapeXml(value: string): string { return value.replace(/[<>&'\"]/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[character] ?? character); }
