import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderFactory } from "@/providers/telephony/provider.factory";
import { ExotelProvider, isExotelRecordingUrl, normalizeExotelInboundPayload, normalizeExotelStatusPayload } from "@/providers/telephony/exotel.provider";
import { ExotelHumanTransferAdapter } from "@/providers/telephony/exotel-human-transfer.adapter";

function configureExotel(): void {
  vi.stubEnv("EXOTEL_ACCOUNT_SID", "exotel-account");
  vi.stubEnv("EXOTEL_API_KEY", "exotel-key");
  vi.stubEnv("EXOTEL_API_TOKEN", "exotel-token");
  vi.stubEnv("EXOTEL_SUBDOMAIN", "api.in.exotel.com");
  vi.stubEnv("EXOTEL_CALLER_ID", "+919999999999");
  vi.stubEnv("EXOTEL_PUBLIC_BASE_URL", "https://ivr.example.com");
  vi.stubEnv("EXOTEL_WEBHOOK_SECRET", "a-long-webhook-secret-value");
}

afterEach(() => vi.unstubAllEnvs());

describe("Exotel telephony provider", () => {
  it("selects Twilio and Exotel through the provider factory and fails unknown providers", () => {
    vi.stubEnv("TELEPHONY_PROVIDER", "twilio");
    expect(ProviderFactory.getProvider().name).toBe("twilio");
    vi.stubEnv("TELEPHONY_PROVIDER", "exotel");
    expect(ProviderFactory.getProvider().name).toBe("exotel");
    vi.stubEnv("TELEPHONY_PROVIDER", "other");
    expect(() => ProviderFactory.getProvider()).toThrow("Invalid TELEPHONY_PROVIDER");
  });

  it("maps an outbound request to Exotel Voice v1 without exposing API credentials", async () => {
    configureExotel();
    vi.stubEnv("EXOTEL_MEDIA_PUBLIC_URL", "wss://media.example.com");
    vi.stubEnv("EXOTEL_STREAM_USERNAME", "media-user");
    vi.stubEnv("EXOTEL_STREAM_PASSWORD", "media-password");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Call: { Sid: "exo-call-1", Status: "queued" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ExotelProvider().makeCall({ callId: "internal-1", campaignId: "campaign", contactId: "contact", contactPhone: "+919999999999", to: "9999999999", from: "+919999999999", language: "English", script: "Hello" });
    expect(result).toMatchObject({ callId: "exo-call-1", providerCallId: "exo-call-1", status: "queued" });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.in.exotel.com/v1/Accounts/exotel-account/calls/connect");
    const body = String(options.body);
    expect(body).toContain("from=%2B919999999999");
    expect(body).toContain("streamtype=bidirectional");
    expect(body).toContain("streamurl=wss%3A%2F%2Fmedia.example.com%2Fapi%2Fexotel%2Fstream%3Fsample-rate%3D8000");
    expect(body).toContain("record=true");
    expect(JSON.stringify(options)).not.toContain("exotel-token");
  });

  it("normalizes inbound IDs, provider statuses, and canonical single DTMF input", () => {
    const provider = new ExotelProvider();
    expect(normalizeExotelInboundPayload({ CallSid: "exo-1", From: "+919999999999", To: "+918888888888" })).toEqual({ providerCallId: "exo-1", callerNumber: "+919999999999", calledNumber: "+918888888888" });
    expect(normalizeExotelStatusPayload({ CallSid: "exo-1", CallStatus: "no-answer", CallDuration: "12", RecordingUrl: "https://s3-ap-southeast-1.amazonaws.com/exotelrecordings/exotel-account/exo-1.mp3" })).toMatchObject({ providerCallId: "exo-1", status: "no-answer", duration: 12, recordingUrl: "https://s3-ap-southeast-1.amazonaws.com/exotelrecordings/exotel-account/exo-1.mp3" });
    expect(isExotelRecordingUrl("https://s3-ap-southeast-1.amazonaws.com/exotelrecordings/exotel-account/exo-1.mp3")).toBe(true);
    expect(isExotelRecordingUrl("https://evil.example/recording.mp3")).toBe(false);
    expect(provider.normalizeCallStatus("no-answer")).toBe("NO_ANSWER");
    expect(provider.normalizeDtmf("4")).toBe("4");
    expect(provider.normalizeDtmf("44")).toBeNull();
  });

  it("advertises only AgentStream capabilities and keeps live transfer explicitly unsupported", async () => {
    configureExotel();
    const provider = new ExotelProvider();
    expect(provider.capabilities).toMatchObject({ supportsRealtimeMedia: true, supportsBidirectionalMedia: true, supportsBargeIn: true, supportsRecording: true, supportsGeminiLive: true });
    const transfer = await new ExotelHumanTransferAdapter().transfer({ callId: "internal-1", providerCallId: "exo-call-1", provider: "EXOTEL", strategy: "DIRECT_NUMBER", destination: "+919999999999" });
    expect(transfer).toMatchObject({ success: false, code: "EXOTEL_TRANSFER_UNSUPPORTED" });
  });
});
