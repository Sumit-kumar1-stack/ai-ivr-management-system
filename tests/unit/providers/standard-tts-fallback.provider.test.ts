import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  twilioCalls: vi.fn(),
  twilioUpdate: vi.fn(),
  createErrorTwiml: vi.fn(),
  getPlivoEnvironment: vi.fn(),
  getPlivoPublicCallbackUrl: vi.fn(),
}));

vi.mock("@/providers/twilio/twilio.client", () => ({
  twilioClient: {
    calls: mocks.twilioCalls,
  },
}));

vi.mock("@/providers/telephony/twilio-media-twiml.service", () => ({
  createErrorTwiml:
    mocks.createErrorTwiml,
}));

vi.mock("@/config/env", () => ({
  getPlivoEnvironment:
    mocks.getPlivoEnvironment,
}));

vi.mock("@/lib/plivo-public-url", () => ({
  getPlivoPublicCallbackUrl:
    mocks.getPlivoPublicCallbackUrl,
}));

vi.mock("@/lib/logger", () => ({
  createCallLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  normalizeError: vi.fn(() => ({
    name: "Error",
    message: "redacted",
  })),
}));

import {
  BaseTelephonyProvider,
} from "@/providers/telephony/base.provider";
import {
  PlivoProvider,
} from "@/providers/telephony/plivo.provider";
import {
  TwilioProvider,
} from "@/providers/telephony/twilio.provider";

describe("provider Standard TTS fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
      })
    );
    mocks.twilioCalls.mockReturnValue({
      update: mocks.twilioUpdate,
    });
    mocks.twilioUpdate.mockResolvedValue({
      sid: "CA123",
    });
    mocks.createErrorTwiml.mockReturnValue(
      "<Response><Say>safe</Say></Response>"
    );
    mocks.getPlivoEnvironment.mockReturnValue({
      authId: "plivo-auth-id",
      authToken: "plivo-auth-token",
    });
    mocks.getPlivoPublicCallbackUrl.mockReturnValue(
      new URL(
        "https://voice.example.test/api/plivo/tts-fallback?callId=call-1"
      )
    );
  });

  it("preserves the existing Twilio call update fallback", async () => {
    await new TwilioProvider()
      .applyStandardTtsFallback(
        "call-1",
        "CA123"
      );

    expect(mocks.twilioCalls)
      .toHaveBeenCalledWith("CA123");
    expect(mocks.twilioUpdate)
      .toHaveBeenCalledWith({
        twiml:
          "<Response><Say>safe</Say></Response>",
      });
  });

  it("uses Plivo active-call control and never invokes Twilio", async () => {
    await new PlivoProvider()
      .applyStandardTtsFallback(
        "call-1",
        "plivo-call-uuid"
      );

    expect(fetch)
      .toHaveBeenCalledTimes(1);
    expect(fetch)
      .toHaveBeenCalledWith(
        expect.stringContaining(
          "/Call/plivo-call-uuid/"
        ),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            legs: "aleg",
            aleg_url:
              "https://voice.example.test/api/plivo/tts-fallback?callId=call-1",
            aleg_method: "POST",
          }),
        })
      );
    expect(mocks.twilioCalls)
      .not.toHaveBeenCalled();
  });

  it("fails closed for a provider without an explicit implementation", async () => {
    class UnsupportedProvider extends BaseTelephonyProvider {
      readonly name = "mock" as const;
      readonly capabilities = {
        supportsInbound: false,
        supportsOutbound: false,
        supportsDtmf: false,
        supportsXmlInput: false,
        supportsRealtimeDtmfDuringMedia: false,
        supportsTransfer: false,
        supportsRecording: false,
        supportsRealtimeMedia: false,
        supportsBidirectionalMedia: false,
        supportsBargeIn: false,
        supportsStatusCallbacks: false,
        supportsStreamingTts: false,
        supportsGeminiLive: false,
        supportsCallControlUpdate: false,
      };
      async makeCall() {
        return {
          callId: "unused",
          status: "failed",
        };
      }
      async endCall() {}
      async handleWebhook() {}
    }

    await expect(
      new UnsupportedProvider()
        .applyStandardTtsFallback(
          "call-1",
          "provider-id"
        )
    ).rejects.toThrow(
      "does not support Standard TTS fallback"
    );
  });
});
