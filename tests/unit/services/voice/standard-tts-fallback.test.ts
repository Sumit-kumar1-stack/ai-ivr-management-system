import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  log: { warn: vi.fn(), error: vi.fn() },
  publish: vi.fn(),
  getCall: vi.fn(),
  setState: vi.fn(),
  update: vi.fn(),
  calls: vi.fn(),
  createErrorTwiml: vi.fn(),
}));

vi.mock("@/core/events", () => ({
  AppEvent: { FALLBACK_TRIGGERED: "audit.fallback_triggered" },
  EventPublisher: { publish: mocks.publish },
}));

vi.mock("@/lib/logger", () => ({
  createCallLogger: vi.fn(() => mocks.log),
  normalizeError: vi.fn(() => ({ message: "tts failed" })),
}));

vi.mock("@/providers/telephony/twilio-media-twiml.service", () => ({
  createErrorTwiml: mocks.createErrorTwiml,
}));

vi.mock("@/providers/twilio/twilio.client", () => ({
  twilioClient: { calls: mocks.calls },
}));

vi.mock("@/services/calls/call.service", () => ({ getCall: mocks.getCall }));
vi.mock("@/services/conversations/conversation-state.service", () => ({
  ConversationStateService: { setState: mocks.setState },
}));

import {
  playStandardTtsFallback,
} from "@/services/voice/standard-tts-fallback.service";

describe("standard TTS fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.mockReturnValue({ update: mocks.update });
    mocks.getCall.mockResolvedValue({ providerCallId: "CA123" });
    mocks.createErrorTwiml.mockReturnValue("<Response><Say>safe</Say></Response>");
    mocks.update.mockResolvedValue({ sid: "CA123" });
    mocks.publish.mockResolvedValue(true);
  });

  it("redirects to static safe TwiML and audits after retry-exhausted TTS failure", async () => {
    const result = await playStandardTtsFallback("call-1", new Error("429"));

    expect(result).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      twiml: "<Response><Say>safe</Say></Response>",
    }));
    expect(mocks.setState).toHaveBeenCalledWith("call-1", "ENDED");
    expect(mocks.publish).toHaveBeenCalledWith("audit.fallback_triggered", expect.objectContaining({
      callId: "call-1",
      fallbackType: "STANDARD_TTS_FAILURE",
    }));
  });

  it("fails closed without a provider call identifier", async () => {
    mocks.getCall.mockResolvedValue({ providerCallId: null });

    const result = await playStandardTtsFallback("call-1", new Error("tts failed"));

    expect(result).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
