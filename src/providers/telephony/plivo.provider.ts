import { getPlivoEnvironment } from "@/config/env";
import { createPlivoStreamToken } from "@/lib/plivo-stream-auth";
import { getPlivoPublicCallbackUrl } from "@/lib/plivo-public-url";
import { normalizePlivoPstnNumber, normalizePstnNumber } from "@/lib/telephony-number";
import { createCallLogger, normalizeError } from "@/lib/logger";
import type { CallResponse, ProviderCallRequest } from "@/services/telephony/types";
import { Client as PlivoClient } from "plivo";
import { BaseTelephonyProvider } from "./base.provider";
import type {
  OutboundProviderCallRequest,
  OutboundProviderCallResult,
} from "./outbound-call.types";

type PlivoCreateCallResponse = { request_uuid?: unknown; message?: unknown };

/** Plivo Voice API adapter. The create-call API returns a request UUID; the
 * CallUUID is supplied by signed callbacks and is the only value persisted as
 * providerCallId. */
export class PlivoProvider extends BaseTelephonyProvider {
  readonly name = "plivo" as const;
  readonly capabilities = {
    supportsInbound: true, supportsOutbound: true, supportsDtmf: true, supportsXmlInput: true,
    // Plivo documents DTMF collection through XML GetInput/GetDigits, not an
    // inbound event on a bidirectional Audio Stream.
    supportsRealtimeDtmfDuringMedia: false,
    supportsTransfer: true, supportsRecording: true,
    supportsRealtimeMedia: true, supportsBidirectionalMedia: true,
    supportsBargeIn: true, supportsStatusCallbacks: true, supportsCallControlUpdate: true,
    supportsStreamingTts: true, supportsGeminiLive: true,
  } as const;

  async applyStandardTtsFallback(
    callId: string,
    providerCallId: string
  ): Promise<void> {
    const config =
      getPlivoEnvironment();
    const normalizedProviderCallId =
      providerCallId.trim();

    if (!normalizedProviderCallId) {
      throw new Error(
        "Plivo CallUUID is required"
      );
    }

    const fallbackUrl =
      getPlivoPublicCallbackUrl(
        "/api/plivo/tts-fallback",
        { callId }
      ).toString();

    const response =
      await fetch(
        `https://api.plivo.com/v1/Account/${encodeURIComponent(config.authId)}/Call/${encodeURIComponent(normalizedProviderCallId)}/`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}`,
            "Content-Type":
              "application/json",
            Accept:
              "application/json",
          },
          body:
            JSON.stringify({
              legs: "aleg",
              aleg_url:
                fallbackUrl,
              aleg_method:
                "POST",
            }),
        }
      );

    if (!response.ok) {
      throw new Error(
        `Plivo fallback transfer failed with HTTP ${response.status}`
      );
    }
  }

  async makeCall(request: ProviderCallRequest): Promise<CallResponse> {
    const config = getPlivoEnvironment();
    const destination = normalizePstnNumber(request.to);
    if (!destination) throw new Error("Destination phone number must be a valid E.164 number");
    const log = createCallLogger(request.callId);
    const answerUrl = getPlivoPublicCallbackUrl("/api/plivo/inbound", { callId: request.callId }).toString();
    const ringUrl = getPlivoPublicCallbackUrl("/api/plivo/status", { callId: request.callId }).toString();
    const hangupUrl = getPlivoPublicCallbackUrl("/api/plivo/status", { callId: request.callId }).toString();
    try {
      const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(config.authId)}/Call/`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ from: config.callerId, to: destination, answer_url: answerUrl, answer_method: "POST", ring_url: ringUrl, ring_method: "POST", hangup_url: hangupUrl, hangup_method: "POST" }),
      });
      const payload = await parseResponse(response);
      if (!response.ok) throw new Error(`Plivo call request failed with HTTP ${response.status}`);
      const requestId = stringValue(payload.request_uuid);
      if (!requestId) throw new Error("Plivo response did not include a request UUID");
      log.info({ event: "plivo.outbound.created", provider: "PLIVO", requestId, durationMs: 0 }, "Plivo outbound call requested");
      return { callId: requestId, providerCallId: null, status: "queued" };
    } catch (error) {
      log.error({ event: "plivo.outbound.failed", provider: "PLIVO", error: normalizeError(error) }, "Plivo outbound call failed");
      throw error;
    }
  }

  /** CommunicationCampaign E.3 boundary. The installed Plivo SDK returns a
   * request UUID here; the signed callback supplies the eventual CallUUID. */
  async executeOutboundCall(
    request: OutboundProviderCallRequest
  ): Promise<OutboundProviderCallResult> {
    const config = getPlivoEnvironment();
    const caller = normalizePstnNumber(request.from);
    const destination = normalizePstnNumber(request.to);

    if (!caller || !destination) {
      throw new Error("Plivo outbound caller and destination must be valid E.164 numbers");
    }

    const client = new PlivoClient(config.authId, config.authToken);
    const response = await client.calls.create(
      normalizePlivoApiNumber(caller),
      normalizePlivoApiNumber(destination),
      request.answerUrl,
      {
        answerMethod: "POST",
        hangupUrl: request.statusCallbackUrl,
        hangupMethod: "POST",
      }
    );
    const requestId = firstString(response.requestUuid);

    if (!requestId) {
      throw new Error("Plivo response did not include a request UUID");
    }

    return {
      accepted: true,
      provider: "PLIVO",
      providerRequestId: requestId,
      providerCallId: null,
      rawProviderStatus: "queued",
    };
  }

  async endCall(callId: string): Promise<void> {
    const config = getPlivoEnvironment();
    if (!callId.trim()) throw new Error("Plivo CallUUID is required");
    const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(config.authId)}/Call/${encodeURIComponent(callId.trim())}/`, {
      method: "DELETE", headers: { Authorization: `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}` },
    });
    if (!response.ok) throw new Error(`Plivo end call request failed with HTTP ${response.status}`);
  }

  async handleWebhook(body: unknown): Promise<void> { void body; }

  async startBidirectionalStream(callId: string, providerCallId: string): Promise<void> {
    const config = getPlivoEnvironment();
    const serviceUrl = getPlivoBidirectionalStreamUrl(callId);
    const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(config.authId)}/Call/${encodeURIComponent(providerCallId)}/Stream/`, {
      method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ service_url: serviceUrl.toString(), bidirectional: true, audio_track: "inbound", content_type: "audio/x-mulaw;rate=8000" }),
    });
    if (!response.ok) throw new Error(`Plivo stream request failed with HTTP ${response.status}`);
  }

  /** Starts Plivo's documented active-call recording API. Recording media is
   * never placed in a callback URL or application log. */
  async startRecording(callId: string, providerCallId: string): Promise<void> {
    const config = getPlivoEnvironment();
    const callbackUrl = getPlivoPublicCallbackUrl("/api/plivo/recording", { callId }).toString();
    const log = createCallLogger(callId);
    log.info({ event: "plivo.recording.requested", providerCallId, durationMs: 0 }, "Plivo recording requested");
    const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(config.authId)}/Call/${encodeURIComponent(providerCallId)}/Record/`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ time_limit: 14_400, file_format: "mp3", record_channel_type: "mono", callback_url: callbackUrl, callback_method: "POST" }),
    });
    if (!response.ok) throw new Error(`Plivo recording request failed with HTTP ${response.status}`);
    log.info({ event: "plivo.recording.started", providerCallId, durationMs: 0 }, "Plivo recording started");
  }

  /** Resolves a real recording media URL from the authenticated Plivo API.
   * The URL is intentionally transient and must not be logged or persisted. */
  async getRecordingMediaUrl(recordingId: string): Promise<URL> {
    const config = getPlivoEnvironment();
    const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(config.authId)}/Recording/${encodeURIComponent(recordingId)}/`, { headers: { Authorization: `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString("base64")}`, Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Plivo recording lookup failed with HTTP ${response.status}`);
    const payload = await response.json() as { recording_url?: unknown };
    const rawUrl = stringValue(payload.recording_url);
    if (!rawUrl) throw new Error("Plivo recording lookup did not include recording_url");
    const mediaUrl = new URL(rawUrl);
    if (!/^https?:$/.test(mediaUrl.protocol) || !isAllowedPlivoRecordingHost(mediaUrl.hostname)) throw new Error("Plivo recording lookup returned an unsafe media host");
    if (mediaUrl.protocol === "http:") mediaUrl.protocol = "https:";
    return mediaUrl;
  }
}

export function normalizePlivoInboundPayload(payload: Record<string, unknown>) {
  return { providerCallId: stringValue(payload.CallUUID ?? payload.call_uuid), callerNumber: normalizePlivoPstnNumber(payload.From ?? payload.from), calledNumber: normalizePlivoPstnNumber(payload.To ?? payload.to) };
}

export function normalizePlivoStatusPayload(payload: Record<string, unknown>) {
  const duration = Number(payload.Duration ?? payload.duration ?? payload.TotalDuration);
  const hangupCauseCode = Number(payload.HangupCauseCode ?? payload.hangup_cause_code);
  return {
    providerCallId: stringValue(payload.CallUUID ?? payload.call_uuid),
    status: stringValue(payload.CallStatus ?? payload.call_status ?? payload.Event),
    duration: Number.isFinite(duration) && duration >= 0 ? Math.floor(duration) : undefined,
    hangupCauseName: stringValue(payload.HangupCauseName ?? payload.hangup_cause_name ?? payload.HangupCause ?? payload.hangup_cause),
    hangupCauseCode: Number.isFinite(hangupCauseCode) ? Math.floor(hangupCauseCode) : undefined,
    hangupSource: stringValue(payload.HangupSource ?? payload.hangup_source),
  };
}

/** Builds the signed WSS endpoint used by Plivo's XML <Stream> verb. */
export function getPlivoBidirectionalStreamUrl(callId: string): URL {
  const config = getPlivoEnvironment();
  if (!config.mediaPublicUrl) throw new Error("PLIVO_MEDIA_PUBLIC_URL is required for Plivo media streaming");
  const serviceUrl = new URL("/api/plivo/stream", `${config.mediaPublicUrl}/`);
  serviceUrl.searchParams.set("callId", callId);
  serviceUrl.searchParams.set("token", createPlivoStreamToken(callId));
  return serviceUrl;
}

function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function firstString(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(stringValue).find(Boolean) ?? null;
  return stringValue(value);
}
function normalizePlivoApiNumber(value: string): string { return value.replace(/^\+/, ""); }
async function parseResponse(response: Response): Promise<PlivoCreateCallResponse> { try { return await response.json() as PlivoCreateCallResponse; } catch { return {}; } }
function isAllowedPlivoRecordingHost(hostname: string): boolean { const host = hostname.toLowerCase(); return host === "s3.amazonaws.com" || host.endsWith(".amazonaws.com") || host.endsWith(".plivo.com"); }
