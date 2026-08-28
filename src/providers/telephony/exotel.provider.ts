import { getExotelEnvironment } from "@/config/env";
import { createCallLogger, normalizeError } from "@/lib/logger";
import type { CallResponse, ProviderCallRequest } from "@/services/telephony/types";
import { BaseTelephonyProvider } from "./base.provider";

type ExotelCallResponse = {
  Call?: { Sid?: unknown; Status?: unknown };
  call?: { sid?: unknown; status?: unknown };
};

/**
 * Exotel Voice v1 + AgentStream adapter. Media is served by its own WebSocket
 * endpoint and never falls through to the Twilio transport.
 */
export class ExotelProvider extends BaseTelephonyProvider {
  readonly name = "exotel" as const;
  readonly capabilities = {
    supportsInbound: true,
    supportsOutbound: true,
    supportsDtmf: true,
    supportsXmlInput: false,
    supportsRealtimeDtmfDuringMedia: true,
    supportsTransfer: false,
    supportsRecording: true,
    supportsRealtimeMedia: true,
    supportsBidirectionalMedia: true,
    supportsBargeIn: true,
    supportsStatusCallbacks: true,
    supportsStreamingTts: true,
    supportsGeminiLive: true,
    supportsCallControlUpdate: false,
  } as const;

  async makeCall(request: ProviderCallRequest): Promise<CallResponse> {
    const startedAt = Date.now();
    const log = createCallLogger(request.callId);
    const config = getExotelEnvironment();
    const destination = normalizePhoneNumber(request.to);
    if (!destination) throw new Error("Destination phone number must be a valid E.164 number");

    const statusUrl = buildCallbackUrl(config.publicBaseUrl, "/api/exotel/status", request.callId, config.webhookSecret);
    const body = new URLSearchParams({
      from: destination,
      callerid: config.callerId,
      record: "true",
      recordingchannels: "dual",
      customfield: request.callId,
      statuscallback: statusUrl,
    });
    body.append("statuscallbackevents[]", "answered");
    body.append("statuscallbackevents[]", "ringing");
    body.append("statuscallbackevents[]", "terminal");

    if (config.mediaPublicUrl) {
      const streamUrl = new URL("/api/exotel/stream", `${config.mediaPublicUrl}/`);
      streamUrl.searchParams.set("sample-rate", "8000");
      body.set("streamurl", streamUrl.toString());
      body.set("streamtype", "bidirectional");
    } else {
      body.set("url", buildCallbackUrl(config.publicBaseUrl, "/api/exotel/inbound", request.callId, config.webhookSecret));
    }

    log.info({ event: "exotel.outbound.requested", provider: "EXOTEL", providerCallId: null, durationMs: 0 }, "Exotel outbound call requested");
    try {
      const response = await fetch(this.endpoint("calls/connect"), {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });
      const payload = await parseResponse(response);
      if (!response.ok) throw new Error(`Exotel call request failed with HTTP ${response.status}`);
      const providerCallId = this.normalizeProviderCallId(payload.Call?.Sid ?? payload.call?.sid);
      if (!providerCallId) throw new Error("Exotel response did not include a call identifier");
      const status = String(payload.Call?.Status ?? payload.call?.status ?? "initiated");
      log.info({ event: "exotel.outbound.created", provider: "EXOTEL", providerCallId, durationMs: Date.now() - startedAt }, "Exotel outbound call created");
      return { callId: providerCallId, providerCallId, status };
    } catch (error) {
      log.error({ event: "exotel.outbound.failed", provider: "EXOTEL", durationMs: Date.now() - startedAt, error: normalizeError(error) }, "Exotel outbound call failed");
      throw error;
    }
  }

  async endCall(callId: string): Promise<void> {
    // Voice v1 does not document a safe live-call hangup endpoint. Do not claim
    // support or substitute a Twilio operation.
    throw new Error(`EXOTEL_END_CALL_UNSUPPORTED: Exotel Voice v1 cannot end active call ${callId}`);
  }

  async handleWebhook(_body: unknown): Promise<void> {
    // Routes normalize and dispatch authenticated Exotel callbacks.
  }

  endpoint(path: string): string {
    const config = getExotelEnvironment();
    return `https://${config.subdomain}/v1/Accounts/${encodeURIComponent(config.accountSid)}/${path}`;
  }
}

export function normalizeExotelInboundPayload(payload: Record<string, unknown>) {
  return {
    providerCallId: stringValue(payload.CallSid ?? payload.call_sid ?? payload.Sid),
    callerNumber: stringValue(payload.From ?? payload.from ?? payload.Caller),
    calledNumber: stringValue(payload.To ?? payload.to ?? payload.Called),
  };
}

export function normalizeExotelStatusPayload(payload: Record<string, unknown>) {
  const duration = Number(payload.CallDuration ?? payload.Duration ?? payload.duration);
  return {
    providerCallId: stringValue(payload.CallSid ?? payload.call_sid ?? payload.Sid),
    status: stringValue(payload.CallStatus ?? payload.Status ?? payload.status),
    duration: Number.isFinite(duration) && duration >= 0 ? Math.floor(duration) : undefined,
    recordingUrl: stringValue(payload.RecordingUrl ?? payload.recording_url ?? payload.recordingurl),
  };
}

/** Documented Exotel Bulk Call Details recording URL form. */
export function isExotelRecordingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "s3-ap-southeast-1.amazonaws.com" && /^\/exotelrecordings\/[A-Za-z0-9_-]+\/.+\.(mp3|wav)$/i.test(url.pathname);
  } catch { return false; }
}

function buildCallbackUrl(baseUrl: string, pathname: string, callId: string, secret: string): string {
  const url = new URL(pathname, `${baseUrl}/`);
  url.searchParams.set("callId", callId);
  url.searchParams.set("token", secret);
  return url.toString();
}

function normalizePhoneNumber(value: string): string | null {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (/^\d{10}$/.test(normalized)) return `+91${normalized}`;
  if (/^91\d{10}$/.test(normalized)) return `+${normalized}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function parseResponse(response: Response): Promise<ExotelCallResponse> {
  try { return await response.json() as ExotelCallResponse; } catch { return {}; }
}
