import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  log: {
    warn: vi.fn(),
    error: vi.fn(),
  },
  publish: vi.fn(),
  getCall: vi.fn(),
  setState: vi.fn(),
  applyFallback: vi.fn(),
  getProviderForName: vi.fn(),
}));

vi.mock("@/core/events", () => ({
  AppEvent: {
    FALLBACK_TRIGGERED:
      "audit.fallback_triggered",
  },
  EventPublisher: {
    publish: mocks.publish,
  },
}));

vi.mock("@/lib/logger", () => ({
  createCallLogger: vi.fn(() =>
    mocks.log
  ),
}));

vi.mock("@/providers/telephony/provider.factory", () => ({
  ProviderFactory: {
    getProviderForName:
      mocks.getProviderForName,
  },
}));

vi.mock("@/services/calls/call.service", () => ({
  getCall: mocks.getCall,
}));

vi.mock("@/services/conversations/conversation-state.service", () => ({
  ConversationStateService: {
    setState: mocks.setState,
  },
}));

import {
  playStandardTtsFallback,
} from "@/services/voice/standard-tts-fallback.service";

describe("standard TTS fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCall.mockResolvedValue({
      provider: "TWILIO",
      providerCallId: "CA123",
    });
    mocks.getProviderForName.mockReturnValue({
      name: "twilio",
      applyStandardTtsFallback:
        mocks.applyFallback,
    });
    mocks.applyFallback.mockResolvedValue(
      undefined
    );
    mocks.publish.mockResolvedValue(true);
  });

  it("resolves the persisted provider and audits a successful fallback", async () => {
    const result =
      await playStandardTtsFallback(
        "call-1",
        new Error("429")
      );

    expect(result).toBe(true);
    expect(mocks.getProviderForName)
      .toHaveBeenCalledWith("TWILIO");
    expect(mocks.applyFallback)
      .toHaveBeenCalledWith(
        "call-1",
        "CA123"
      );
    expect(mocks.setState)
      .toHaveBeenCalledWith(
        "call-1",
        "ENDED"
      );
    expect(mocks.publish)
      .toHaveBeenCalledWith(
        "audit.fallback_triggered",
        expect.objectContaining({
          callId: "call-1",
          fallbackType:
            "STANDARD_TTS_FAILURE",
          provider: "TWILIO",
        })
      );
  });

  it("fails closed without a provider call identifier", async () => {
    mocks.getCall.mockResolvedValue({
      provider: "PLIVO",
      providerCallId: null,
    });

    const result =
      await playStandardTtsFallback(
        "call-1",
        new Error("tts failed")
      );

    expect(result).toBe(false);
    expect(mocks.getProviderForName)
      .not.toHaveBeenCalled();
    expect(mocks.publish)
      .not.toHaveBeenCalled();
  });

  it("fails closed when the persisted provider does not support fallback", async () => {
    mocks.getCall.mockResolvedValue({
      provider: "EXOTEL",
      providerCallId: "unsupported-id",
    });
    mocks.getProviderForName.mockReturnValue({
      name: "exotel",
      applyStandardTtsFallback:
        vi.fn().mockRejectedValue(
          new Error("unsupported")
        ),
    });

    expect(
      await playStandardTtsFallback(
        "call-1",
        new Error("tts failed")
      )
    ).toBe(false);
    expect(mocks.setState)
      .not.toHaveBeenCalled();
    expect(mocks.publish)
      .not.toHaveBeenCalled();
  });

  it("does not put provider or TTS error secrets in logs or audit metadata", async () => {
    mocks.applyFallback.mockRejectedValue(
      new Error("provider-secret-token")
    );

    await playStandardTtsFallback(
      "call-1",
      new Error("tts-secret-token")
    );

    const metadata =
      JSON.stringify({
        warning: mocks.log.warn.mock.calls,
        error: mocks.log.error.mock.calls,
        audit: mocks.publish.mock.calls,
      });

    expect(metadata)
      .not.toContain("provider-secret-token");
    expect(metadata)
      .not.toContain("tts-secret-token");
  });
});
