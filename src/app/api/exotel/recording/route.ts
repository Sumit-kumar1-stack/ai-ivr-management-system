import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerLogger, normalizeError } from "@/lib/logger";
import { createExotelAuthErrorResponse, validateExotelWebhook } from "@/lib/exotel-webhook-auth";
import { isExotelRecordingUrl } from "@/providers/telephony/exotel.provider";

const log = createServerLogger("exotel-recording-route");

/** AgentStream Passthru recording callback; playback stays behind the call proxy. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validateExotelWebhook(request);
    const providerCallId = value(payload.call_sid ?? payload.CallSid ?? payload.sid);
    const recordingUrl = value(payload.recordingurl ?? payload.RecordingUrl ?? payload.recording_url);
    if (!providerCallId || !recordingUrl) return NextResponse.json({ success: false, message: "call_sid and recordingurl are required" }, { status: 400 });
    if (!isExotelRecordingUrl(recordingUrl)) {
      log.warn({ event: "exotel.recording.rejected", providerCallId, reason: "unsafe_recording_url" }, "Exotel recording callback URL rejected");
      return NextResponse.json({ success: false, message: "Invalid recording URL" }, { status: 400 });
    }
    const updated = await prisma.call.updateMany({ where: { provider: "EXOTEL", providerCallId }, data: { recordingUrl } });
    log.info({ event: "exotel.recording.available", providerCallId, updatedCount: updated.count, durationMs: 0 }, "Exotel recording callback processed");
    return NextResponse.json({ success: true, matched: updated.count > 0 });
  } catch (error) {
    const auth = createExotelAuthErrorResponse(error);
    if (auth) return auth;
    log.error({ event: "exotel.recording.failed", error: normalizeError(error) }, "Exotel recording callback failed");
    return NextResponse.json({ success: false, message: "Failed to process recording callback" }, { status: 500 });
  }
}

function value(input: string | undefined): string | undefined { return input?.trim() || undefined; }
