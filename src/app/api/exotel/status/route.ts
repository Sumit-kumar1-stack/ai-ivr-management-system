import { NextRequest, NextResponse } from "next/server";
import { createServerLogger, normalizeError } from "@/lib/logger";
import { createExotelAuthErrorResponse, validateExotelWebhook } from "@/lib/exotel-webhook-auth";
import { isExotelRecordingUrl, normalizeExotelStatusPayload } from "@/providers/telephony/exotel.provider";
import { processProviderStatusCallback } from "@/services/telephony/status-callback.service";
import { prisma } from "@/lib/prisma";

const log = createServerLogger("exotel-status-route");

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validateExotelWebhook(request);
    const status = normalizeExotelStatusPayload(payload);
    if (!status.providerCallId || !status.status) return NextResponse.json({ success: false, message: "CallSid and CallStatus are required" }, { status: 400 });
    const result = await processProviderStatusCallback({
      callId: request.nextUrl.searchParams.get("callId")?.trim() || undefined,
      providerCallId: status.providerCallId,
      status: status.status,
      duration: status.duration,
    });
    if (status.recordingUrl && isExotelRecordingUrl(status.recordingUrl) && result.callId) {
      await prisma.call.updateMany({ where: { id: result.callId, provider: "EXOTEL" }, data: { recordingUrl: status.recordingUrl } });
      log.info({ event: "exotel.recording.available", providerCallId: status.providerCallId, internalCallId: result.callId, durationMs: 0 }, "Exotel recording metadata saved from status callback");
    } else if (status.recordingUrl) {
      log.warn({ event: "exotel.recording.rejected", providerCallId: status.providerCallId, reason: "unsafe_recording_url" }, "Exotel status callback recording URL rejected");
    }
    log.info({ event: "exotel.status.received", providerCallId: status.providerCallId, internalCallId: result.callId ?? null, duplicate: result.duplicate ?? false, durationMs: 0 }, "Exotel status callback processed");
    return NextResponse.json({ success: true, matched: Boolean(result.callId), ignored: result.ignored ?? false, duplicate: result.duplicate ?? false });
  } catch (error) {
    const auth = createExotelAuthErrorResponse(error);
    if (auth) return auth;
    log.error({ event: "exotel.status.failed", error: normalizeError(error) }, "Exotel status callback failed");
    return NextResponse.json({ success: false, message: "Failed to process status callback" }, { status: 500 });
  }
}
