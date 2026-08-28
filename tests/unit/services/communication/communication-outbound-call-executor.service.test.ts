import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  plivo: vi.fn(),
  twilio: vi.fn(),
  exotel: vi.fn(),
  telnyx: vi.fn(),
}));

vi.mock("@/providers/telephony/provider.factory", () => ({
  ProviderFactory: { getProviderForName: mocks.getProvider },
}));

import { executeOutboundCallAttempt } from "@/services/communication/communication-outbound-call-executor.service";

const request = {
  tenantId: "tenant-1",
  campaignId: "campaign-1",
  campaignRecipientId: "recipient-1",
  attemptId: "attempt-1",
  attemptNumber: 1,
  provider: "PLIVO",
  from: "+14155550100",
  to: "+14155550101",
  answerUrl: "https://voice.example.test/api/plivo/outbound/answer?attempt=attempt-1",
  statusCallbackUrl: "https://voice.example.test/api/plivo/outbound/status?attempt=attempt-1",
};

describe("provider-neutral outbound execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plivo.mockResolvedValue({
      accepted: true,
      provider: "PLIVO",
      providerRequestId: "request-1",
      providerCallId: null,
      rawProviderStatus: "queued",
    });
    mocks.getProvider.mockReturnValue({
      capabilities: { supportsOutbound: true },
      executeOutboundCall: mocks.plivo,
    });
  });

  it("selects only the persisted Plivo adapter and sends a minimal request", async () => {
    await executeOutboundCallAttempt(request);
    expect(mocks.getProvider).toHaveBeenCalledWith("PLIVO");
    expect(mocks.plivo).toHaveBeenCalledTimes(1);
    expect(mocks.twilio).toHaveBeenCalledTimes(0);
    expect(mocks.exotel).toHaveBeenCalledTimes(0);
    expect(mocks.telnyx).toHaveBeenCalledTimes(0);
    expect(mocks.plivo.mock.calls[0][0]).not.toHaveProperty("credentials");
    expect(mocks.plivo.mock.calls[0][0]).not.toHaveProperty("ivrGraph");
    expect(mocks.plivo.mock.calls[0][0]).not.toHaveProperty("knowledgeBase");
  });

  it("fails closed for an adapter without explicit outbound support", async () => {
    mocks.getProvider.mockReturnValue({
      capabilities: { supportsOutbound: false },
      executeOutboundCall: mocks.twilio,
    });
    await expect(executeOutboundCallAttempt({ ...request, provider: "TWILIO" })).rejects.toThrow("does not support");
    expect(mocks.twilio).not.toHaveBeenCalled();
  });
});
