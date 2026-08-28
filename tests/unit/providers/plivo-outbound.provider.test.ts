import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  client: vi.fn(),
}));

vi.mock("plivo", () => ({
  Client: mocks.client,
  validateV3Signature: vi.fn(),
}));

import { PlivoProvider } from "@/providers/telephony/plivo.provider";

describe("Plivo CommunicationCampaign outbound adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockImplementation(function PlivoClientMock() {
      return { calls: { create: mocks.create } };
    });
    process.env.PLIVO_AUTH_ID = "test-auth-id";
    process.env.PLIVO_AUTH_TOKEN = "test-auth-token";
    process.env.PLIVO_CALLER_ID = "+14155550100";
    process.env.PLIVO_PUBLIC_BASE_URL = "https://voice.example.test";
    process.env.PLIVO_MEDIA_PUBLIC_URL = "wss://media.example.test";
    mocks.create.mockResolvedValue({ requestUuid: "request-uuid-1", message: "call fired" });
  });

  it("uses the installed SDK create signature and only supported callback fields", async () => {
    const result = await new PlivoProvider().executeOutboundCall({
      tenantId: "tenant-1",
      campaignId: "campaign-1",
      campaignRecipientId: "recipient-1",
      attemptId: "attempt-opaque-1",
      attemptNumber: 1,
      provider: "PLIVO",
      from: "+14155550100",
      to: "+14155550101",
      answerUrl: "https://voice.example.test/api/plivo/outbound/answer?attempt=attempt-opaque-1",
      statusCallbackUrl: "https://voice.example.test/api/plivo/outbound/status?attempt=attempt-opaque-1",
      recordingCallbackUrl: null,
    });

    expect(mocks.client).toHaveBeenCalledWith("test-auth-id", "test-auth-token");
    expect(mocks.create).toHaveBeenCalledWith(
      "14155550100",
      "14155550101",
      "https://voice.example.test/api/plivo/outbound/answer?attempt=attempt-opaque-1",
      {
        answerMethod: "POST",
        hangupUrl: "https://voice.example.test/api/plivo/outbound/status?attempt=attempt-opaque-1",
        hangupMethod: "POST",
      }
    );
    expect(result).toEqual({
      accepted: true,
      provider: "PLIVO",
      providerRequestId: "request-uuid-1",
      providerCallId: null,
      rawProviderStatus: "queued",
    });
    expect(JSON.stringify(mocks.create.mock.calls)).not.toContain("test-auth-token");
  });

  it("fails when Plivo omits its request UUID", async () => {
    mocks.create.mockResolvedValue({ message: "accepted without correlation" });
    await expect(new PlivoProvider().executeOutboundCall({
      tenantId: "tenant-1",
      campaignId: "campaign-1",
      campaignRecipientId: "recipient-1",
      attemptId: "attempt-1",
      attemptNumber: 1,
      provider: "PLIVO",
      from: "+14155550100",
      to: "+14155550101",
      answerUrl: "https://voice.example.test/answer?attempt=attempt-1",
      statusCallbackUrl: "https://voice.example.test/status?attempt=attempt-1",
    })).rejects.toThrow("request UUID");
  });
});
