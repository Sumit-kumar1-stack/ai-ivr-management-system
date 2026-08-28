import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCallLogger, createServerLogger, getDurationMs, normalizeError } from "@/lib/logger";
import { createPlivoAuthErrorResponse, validatePlivoWebhook } from "@/lib/plivo-webhook-auth";

const log = createServerLogger("plivo-recording-route");

/** Plivo Record API callback. The provider URL is intentionally discarded: the
 * authenticated recording ID is the durable reference and playback resolves it
 * server-side through Plivo's Recording API. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = process.hrtime.bigint();
  try {
    const payload = await validatePlivoWebhook(request);
    const nestedResponse = parseNestedResponse(payload.response);
    const providerCallId = firstValue(payload.call_uuid, payload.CallUUID, payload.callUuid, payload.CallUuid, nestedResponse?.call_uuid, nestedResponse?.CallUUID, nestedResponse?.callUuid, nestedResponse?.CallUuid);
    const recordingId = firstValue(payload.recording_id, payload.RecordingID, payload.recordingId, payload.RecordingId, nestedResponse?.recording_id, nestedResponse?.RecordingID, nestedResponse?.recordingId, nestedResponse?.RecordingId);
    const duration = firstNonNegativeInteger(payload.recording_duration, payload.RecordingDuration, payload.recordingDuration, nestedResponse?.recording_duration, nestedResponse?.RecordingDuration, nestedResponse?.recordingDuration);
    const durationMs = firstNonNegativeInteger(payload.recording_duration_ms, payload.RecordingDurationMs, payload.recordingDurationMs, nestedResponse?.recording_duration_ms, nestedResponse?.RecordingDurationMs, nestedResponse?.recordingDurationMs);
    if (!providerCallId || !recordingId) {
      log.warn({ event: "plivo.recording.callback_invalid_payload", providerCallIdPresent: Boolean(providerCallId), recordingIdPresent: Boolean(recordingId), payloadKeys: Object.keys(payload).sort() }, "Plivo recording callback is missing its call or recording identifier");
      return NextResponse.json({ success: false, message: "call_uuid and recording_id are required" }, { status: 400 });
    }
    log.info({ event: "plivo.recording.callback_received", providerCallId, recordingId, durationMs: getDurationMs(startedAt) }, "Plivo recording callback received");
    const call = await prisma.call.findFirst({ where: { provider: "PLIVO", providerCallId }, select: { id: true, campaignId: true, campaignRunId: true, contactId: true, recordingId: true, recordingUrl: true, attemptNumber: true } });
    if (!call) return NextResponse.json({ success: true, matched: false, ignored: true });
    if (call.recordingId === recordingId && call.recordingUrl === recordingReference(recordingId)) return NextResponse.json({ success: true, matched: true, duplicate: true, callId: call.id });
    const updated = await prisma.call.updateMany({ where: { id: call.id, provider: "PLIVO" }, data: { recordingId, recordingUrl: recordingReference(recordingId), recordingStatus: "AVAILABLE", recordingAvailableAt: new Date(), ...(duration !== undefined ? { duration } : durationMs !== undefined ? { duration: Math.floor(durationMs / 1000) } : {}) } });
    createCallLogger(call.id, { campaignId: call.campaignId, campaignRunId: call.campaignRunId, contactId: call.contactId, providerCallId, attemptNumber: call.attemptNumber }).info({ event: "plivo.recording.available", recordingId, updatedCount: updated.count, durationMs: getDurationMs(startedAt) }, "Plivo recording metadata saved");
    return NextResponse.json({ success: true, matched: true, duplicate: false, callId: call.id });
  } catch (error) {
    const auth = createPlivoAuthErrorResponse(error); if (auth) return auth;
    log.error({ event: "plivo.recording.callback_failed", error: normalizeError(error), durationMs: getDurationMs(startedAt) }, "Plivo recording callback failed");
    return NextResponse.json({ success: false, message: "Failed to process recording callback" }, { status: 500 });
  }
}

export function recordingReference(recordingId: string): string { return `plivo-recording:${recordingId}`; }
function value(input: unknown): string | null { return typeof input === "string" && input.trim() ? input.trim() : null; }
function nonNegativeInteger(input: unknown): number | undefined { const raw = typeof input === "string" || typeof input === "number" ? Number(input) : Number.NaN; return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : undefined; }
function firstValue(...inputs: unknown[]): string | null { for (const input of inputs) { const parsed = value(input); if (parsed) return parsed; } return null; }
function firstNonNegativeInteger(...inputs: unknown[]): number | undefined { for (const input of inputs) { const parsed = nonNegativeInteger(input); if (parsed !== undefined) return parsed; } return undefined; }
function parseNestedResponse(input: unknown): Record<string, unknown> | null { if (typeof input !== "string" || !input.trim()) return null; try { const parsed: unknown = JSON.parse(input); return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; } }
