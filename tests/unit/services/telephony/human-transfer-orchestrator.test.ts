import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
  },
  resolvePolicy: vi.fn(),
  requestTransfer: vi.fn(),
  getCall: vi.fn(),
  beginCallback: vi.fn(),
  buildHandoff: vi.fn(),
  persistLifecycle: vi.fn(),
  persistHandoff: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createCallLogger: vi.fn(() => mocks.log),
}));

vi.mock("@/services/telephony/human-transfer-policy.service", () => ({
  resolveHumanTransferPolicy: mocks.resolvePolicy,
}));

vi.mock("@/services/tools/transfer-to-human.service", () => ({
  requestHumanTransfer: mocks.requestTransfer,
}));

vi.mock("@/services/calls/call.service", () => ({
  getCall: mocks.getCall,
}));

vi.mock("@/services/conversations/callback-conversation.service", () => ({
  beginCallbackConversation: mocks.beginCallback,
}));

vi.mock("@/services/telephony/agent-handoff-context.service", () => ({
  buildAgentHandoffContext: mocks.buildHandoff,
}));

vi.mock("@/services/telephony/agent-transfer-persistence.service", () => ({
  persistTransferLifecycle: mocks.persistLifecycle,
  persistAgentHandoffContext: mocks.persistHandoff,
}));

import {
  orchestrateHumanTransfer,
} from "@/services/telephony/human-transfer-orchestrator.service";

describe("human transfer callback fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCall.mockResolvedValue({
      direction: "INBOUND",
      callerNumber: "+15551234567",
      inboundProfile: { callbackEnabled: true },
    });
    mocks.beginCallback.mockResolvedValue({
      handled: true,
      prompt: "What date and time would you like us to call you back?",
    });
  });

  it("transfers to the caller-supplied tenant destination when policy allows it", async () => {
    mocks.resolvePolicy.mockReturnValue({
      allowed: true,
      timeoutSeconds: 20,
    });
    mocks.requestTransfer.mockResolvedValue({ success: true, durationMs: 20 });

    const result = await orchestrateHumanTransfer("call-1", undefined, {
      destination: "+15557654321",
      destinationUserId: "agent-1",
    });

    expect(result.transferred).toBe(true);
    expect(result.callbackOffered).toBe(false);
    expect(mocks.beginCallback).not.toHaveBeenCalled();
    expect(mocks.requestTransfer).toHaveBeenCalledWith(expect.objectContaining({
      destination: "+15557654321",
      idempotencyKey: "human-transfer:call-1:agent-1",
    }));
  });

  it("offers the existing callback workflow when transfer is denied outside hours", async () => {
    mocks.resolvePolicy.mockReturnValue({
      allowed: false,
      destination: null,
      reason: "Human agents are available during business hours.",
    });

    const result = await orchestrateHumanTransfer("call-1", "Caller requested a human");

    expect(result.transferred).toBe(false);
    expect(result.callbackOffered).toBe(true);
    expect(result.message).toContain("business hours");
    expect(mocks.beginCallback).toHaveBeenCalledWith("call-1", {
      phone: "+15551234567",
      reason: "Caller requested a human",
    });
  });

  it("does not start a callback workflow when the inbound profile disables callbacks", async () => {
    mocks.resolvePolicy.mockReturnValue({
      allowed: false,
      destination: null,
      reason: "Human agents are unavailable.",
    });
    mocks.getCall.mockResolvedValue({
      direction: "INBOUND",
      callerNumber: "+15551234567",
      inboundProfile: { callbackEnabled: false },
    });

    const result = await orchestrateHumanTransfer("call-1");

    expect(result.callbackOffered).toBe(false);
    expect(mocks.beginCallback).not.toHaveBeenCalled();
  });
});
