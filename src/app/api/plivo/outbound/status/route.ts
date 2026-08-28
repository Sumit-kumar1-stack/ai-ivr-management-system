import { NextRequest, NextResponse } from "next/server";

import { createServerLogger, normalizeError } from "@/lib/logger";
import {
  createPlivoAuthErrorResponse,
  validatePlivoWebhook,
} from "@/lib/plivo-webhook-auth";
import { normalizePlivoStatusPayload } from "@/providers/telephony/plivo.provider";
import { processOutboundPlivoLifecycle } from "@/services/communication/communication-outbound-lifecycle.service";

const log = createServerLogger("plivo-outbound-status-route");

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await validatePlivoWebhook(request);
    const attemptId = request.nextUrl.searchParams.get("attempt")?.trim() ?? "";
    const status = normalizePlivoStatusPayload(payload);
    if (!attemptId || !status.providerCallId || !status.status) {
      return NextResponse.json(
        { success: false, message: "Attempt, CallUUID, and CallStatus are required" },
        { status: 400 }
      );
    }

    const result = await processOutboundPlivoLifecycle({
      attemptId,
      providerCallId: status.providerCallId,
      rawStatus: status.status,
      rawCause: status.hangupCauseName,
      duration: status.duration,
    });
    if (!result.matched) {
      return NextResponse.json({ success: false, message: "Outbound attempt not found" }, { status: 404 });
    }
    if (result.conflict) {
      return NextResponse.json({ success: false, message: "Provider call correlation conflict" }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      matched: true,
      ignored: result.ignored,
      duplicate: result.duplicate,
      terminal: result.terminal,
    });
  } catch (error) {
    const auth = createPlivoAuthErrorResponse(error);
    if (auth) return auth;
    log.error(
      { event: "plivo.outbound.status_failed", error: normalizeError(error) },
      "Plivo outbound status callback failed"
    );
    return NextResponse.json({ success: false, message: "Failed to process status callback" }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { success: false, message: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
