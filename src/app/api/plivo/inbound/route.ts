import { NextRequest, NextResponse } from "next/server";
import { createServerLogger, maskPhoneNumber, normalizeError } from "@/lib/logger";
import { createPlivoAuthErrorResponse, validatePlivoWebhook } from "@/lib/plivo-webhook-auth";
import { getPlivoPublicCallbackUrl } from "@/lib/plivo-public-url";
import { getPlivoBidirectionalStreamUrl, normalizePlivoInboundPayload, PlivoProvider } from "@/providers/telephony/plivo.provider";
import { createOrGetInboundCall } from "@/services/calls/inbound-call.service";
import { resolveActiveInboundConfiguration } from "@/services/calls/inbound-number.service";
import { startIVRGraphExecution, type IVRGraphExecutionResult } from "@/services/ivr/ivr-graph-executor.service";
import { resolveRealtimeInputCapability } from "@/services/ivr/realtime-input-capability.service";
import { prisma } from "@/lib/prisma";

const log = createServerLogger("plivo-inbound-route");
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validatePlivoWebhook(request);
    const inbound = normalizePlivoInboundPayload(payload);
    log.debug({
      event: "plivo.inbound.number_resolution_debug",
      provider: "PLIVO",
      providerCallIdPresent: Boolean(inbound.providerCallId),
      from: describeNumber(payload.From ?? payload.from, inbound.callerNumber),
      to: describeNumber(payload.To ?? payload.to, inbound.calledNumber),
    }, "Plivo inbound number normalization evaluated");
    if (!inbound.providerCallId || !inbound.callerNumber || !inbound.calledNumber) return plivoXmlResponse("We could not initialize your call.", true, request.nextUrl);
    const requestedCallId = request.nextUrl.searchParams.get("callId")?.trim();
    if (requestedCallId) {
      const outbound = await prisma.call.findFirst({ where: { id: requestedCallId, provider: "PLIVO" }, select: { id: true, tenantId: true, providerCallId: true, requestedRuntime: true } });
      if (!outbound) return plivoXmlResponse("The call session could not be verified.", true, request.nextUrl);
      if (outbound.providerCallId && outbound.providerCallId !== inbound.providerCallId) return plivoXmlResponse("The call session could not be verified.", true, request.nextUrl);
      if (!outbound.providerCallId) await prisma.call.updateMany({ where: { id: outbound.id, provider: "PLIVO", providerCallId: null }, data: { providerCallId: inbound.providerCallId } });
      await startRecordingIfNeeded(outbound.id, inbound.providerCallId);
      const execution = await startIVRGraphExecution(outbound.id);
      logIvrExecution(outbound.id, execution, null);
      return plivoXmlResponse(execution.speechText ?? "Welcome.", execution.endCall, request.nextUrl, outbound.id, execution, outbound.requestedRuntime ?? undefined);
    }
    const configuration = await resolveActiveInboundConfiguration({ provider: "PLIVO", calledNumber: inbound.calledNumber });
    if (!configuration.configured) { log.warn({ event: "plivo.inbound.unconfigured_number", calledNumber: maskPhoneNumber(inbound.calledNumber), reason: configuration.reason }, "Plivo inbound number is not configured"); return plivoXmlResponse("This number is not available for incoming calls right now.", true, request.nextUrl); }
    log.info({ event: "plivo.inbound.ivr_version_resolved", inboundProfileId: configuration.configuration.inboundProfileId, ivrFlowVersionId: configuration.configuration.ivrFlowVersionId, requestedRuntime: configuration.configuration.requestedRuntime }, "Plivo inbound IVR version resolved");
    const call = await createOrGetInboundCall({ provider: "PLIVO", providerCallId: inbound.providerCallId, callerNumber: inbound.callerNumber, calledNumber: inbound.calledNumber, language: configuration.configuration.defaultLanguage, tenantId: configuration.configuration.tenantId, inboundProfileId: configuration.configuration.inboundProfileId, ivrFlowVersionId: configuration.configuration.ivrFlowVersionId, requestedRuntime: configuration.configuration.requestedRuntime });
    await startRecordingIfNeeded(call.callId, inbound.providerCallId);
    const execution = await startIVRGraphExecution(call.callId);
    logRealtimeInputCapability(call.callId, configuration.configuration.requestedRuntime, execution);
    logIvrExecution(call.callId, execution, configuration.configuration.ivrFlowVersionId);
    logGeminiLiveXmlStreamIfRequired(call.callId, inbound.providerCallId, configuration.configuration.requestedRuntime);
    log.info({ event: "plivo.inbound.received", providerCallId: inbound.providerCallId, internalCallId: call.callId, tenantId: call.tenantId, durationMs: 0 }, "Plivo inbound call initialized");
    return plivoXmlResponse(execution.speechText ?? "Welcome.", execution.endCall, request.nextUrl, call.callId, execution, configuration.configuration.requestedRuntime);
  } catch (error) { const auth = createPlivoAuthErrorResponse(error); if (auth) return auth; log.error({ event: "plivo.inbound.failed", error: normalizeError(error) }, "Plivo inbound webhook failed"); return plivoXmlResponse("A call initialization error occurred.", true, request.nextUrl); }
}
export async function GET(): Promise<NextResponse> { return NextResponse.json({ success: false, message: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } }); }
export function plivoXmlResponse(speech: string, endCall: boolean, _baseUrl: URL, callId?: string, execution?: IVRGraphExecutionResult, requestedRuntime?: string): NextResponse {
  const inputUrl = callId ? getPlivoPublicCallbackUrl("/api/plivo/input", { callId }) : null;
  const text = escapeXml(speech);
  const liveStreamUrl = !endCall && requestedRuntime === "GEMINI_LIVE" && callId ? getPlivoBidirectionalStreamUrl(callId) : null;
  const stagedEntry = Boolean(liveStreamUrl && execution?.entryInputStage && execution.awaitInput && inputUrl);
  const mode = stagedEntry ? "STAGED_ENTRY" : liveStreamUrl ? "GEMINI_LIVE_STREAM" : endCall ? "HANGUP" : execution?.awaitInput && inputUrl ? "GET_DIGITS" : "SPEAK";
  const entryPrompt = escapeXml(execution?.entryPrompt ?? speech);
  const timeoutPrompt = escapeXml(execution?.entryTimeoutPrompt ?? "I will connect you with our AI assistant.");
  // GetDigits and Stream execute sequentially: a digit redirects to the signed
  // action callback; no input falls through to the configured AI entry Stream.
  const timeoutSeconds = execution?.entryTimeoutSeconds ?? 8;
  const xml = mode === "HANGUP" ? `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>${text}</Speak><Hangup/></Response>` : mode === "STAGED_ENTRY" ? `<?xml version="1.0" encoding="UTF-8"?><Response><GetDigits action="${escapeXml(inputUrl!.toString())}" method="POST" numDigits="1" timeout="${timeoutSeconds}"><Speak>${entryPrompt}</Speak></GetDigits><Speak>${timeoutPrompt}</Speak><Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">${escapeXml(liveStreamUrl!.toString())}</Stream></Response>` : mode === "GEMINI_LIVE_STREAM" ? `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>${text}</Speak><Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">${escapeXml(liveStreamUrl!.toString())}</Stream></Response>` : mode === "GET_DIGITS" ? `<?xml version="1.0" encoding="UTF-8"?><Response><GetDigits action="${escapeXml(inputUrl!.toString())}" method="POST" numDigits="1" timeout="8"><Speak>${text}</Speak></GetDigits></Response>` : `<?xml version="1.0" encoding="UTF-8"?><Response><Speak>${text}</Speak></Response>`;
  log.info({ event: "plivo.inbound.answer_xml.generated", mode, verbs: mode === "HANGUP" ? ["Speak", "Hangup"] : mode === "STAGED_ENTRY" ? ["GetDigits", "Speak", "Stream"] : mode === "GEMINI_LIVE_STREAM" ? ["Speak", "Stream"] : mode === "GET_DIGITS" ? ["GetDigits", "Speak"] : ["Speak"], stream: liveStreamUrl ? { keepCallAlive: true, bidirectional: true, contentType: "audio/x-mulaw;rate=8000", serviceHost: liveStreamUrl.host, servicePath: liveStreamUrl.pathname } : null, entryInputStage: stagedEntry, awaitInput: Boolean(execution?.awaitInput), currentIvrNodeId: execution?.currentNodeId ?? null, callIdPresent: Boolean(callId) }, "Plivo inbound Answer XML generated");
  if (stagedEntry) log.info({ event: "plivo.entry_input.started", internalCallId: callId, currentIvrNodeId: execution?.currentNodeId ?? null }, "Plivo XML entry input started");
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
}
function escapeXml(value: string): string { return value.replace(/[<>&'\"]/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[character] ?? character); }
function describeNumber(raw: unknown, normalized: string | null) {
  const value = typeof raw === "string" ? raw.trim() : "";
  return {
    present: Boolean(value), rawLength: value.length, startsWithPlus: value.startsWith("+"), startsWithTelPrefix: /^tel:/i.test(value), normalizedPresent: Boolean(normalized), normalizedLength: normalized?.length ?? 0, normalizedStartsWithPlus: Boolean(normalized?.startsWith("+")),
  };
}

async function startRecordingIfNeeded(callId: string, providerCallId: string): Promise<void> {
  const claimed = await prisma.call.updateMany({ where: { id: callId, provider: "PLIVO", recordingStatus: null }, data: { recordingStatus: "REQUESTED" } });
  if (claimed.count === 0) return;
  try {
    await new PlivoProvider().startRecording(callId, providerCallId);
    await prisma.call.updateMany({ where: { id: callId, provider: "PLIVO", recordingStatus: "REQUESTED" }, data: { recordingStatus: "STARTED" } });
  } catch (error) {
    await prisma.call.updateMany({ where: { id: callId, provider: "PLIVO", recordingStatus: "REQUESTED" }, data: { recordingStatus: "FAILED" } });
    throw error;
  }
}

function logIvrExecution(callId: string, execution: IVRGraphExecutionResult, ivrFlowVersionId: string | null): void {
  log.info({ event: "plivo.inbound.ivr_execution_completed", internalCallId: callId, ivrFlowVersionId, status: execution.status, currentIvrNodeId: execution.currentNodeId, nextIvrNodeId: execution.nextNodeId, awaitInput: execution.awaitInput, endCall: execution.endCall, transitionReason: execution.transitionReason }, "Plivo inbound IVR graph execution completed");
}

function logRealtimeInputCapability(callId: string, runtime: string, execution: IVRGraphExecutionResult): void {
  if (execution.entryInputStage) return;
  if (execution.currentNodeKind !== "HYBRID_MENU") return;
  const capability = resolveRealtimeInputCapability({ provider: "PLIVO", runtime, inputMode: "VOICE_AND_DTMF" });
  if (capability.support === "SUPPORTED") return;
  log.warn({ event: "plivo.inbound.realtime_input_degraded", internalCallId: callId, runtime, currentIvrNodeId: execution.currentNodeId, currentNodeKind: execution.currentNodeKind, support: capability.support, message: capability.message }, "Active input node requires keypad support unavailable during Plivo media streaming");
}

function logGeminiLiveXmlStreamIfRequired(callId: string, providerCallId: string, requestedRuntime: string): void {
  if (requestedRuntime !== "GEMINI_LIVE") return;
  const mediaUrl = getPlivoBidirectionalStreamUrl(callId);
  log.info({ event: "plivo.inbound.stream.xml_configured", internalCallId: callId, providerCallId, requestedRuntime, mediaServiceProtocol: mediaUrl.protocol, mediaServiceHost: mediaUrl.host, mediaServicePath: mediaUrl.pathname, keepCallAlive: true, bidirectional: true }, "Plivo Gemini Live XML stream configured");
}
