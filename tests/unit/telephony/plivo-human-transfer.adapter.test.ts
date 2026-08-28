import { describe, expect, it, vi } from "vitest";

import { PlivoHumanTransferAdapter } from "@/providers/telephony/plivo-human-transfer.adapter";

describe("Plivo human transfer adapter", () => {
  it("uses documented active-call A-leg transfer and does not claim an answer", async () => {
    vi.stubEnv("PLIVO_AUTH_ID", "MA-test");
    vi.stubEnv("PLIVO_AUTH_TOKEN", "token");
    vi.stubEnv("PLIVO_CALLER_ID", "+14155550123");
    vi.stubEnv("PLIVO_PUBLIC_BASE_URL", "https://voice.example.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ api_id: "api-transfer-1" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new PlivoHumanTransferAdapter().transfer({ callId: "call-1", providerCallId: "plivo-call-1", provider: "PLIVO", strategy: "DIRECT_NUMBER", destination: "+14155550124" });

    expect(result).toMatchObject({ success: true, transferReference: "api-transfer-1" });
    const request = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.plivo.com/v1/Account/MA-test/Call/plivo-call-1/");
    expect(JSON.parse(String(request.body))).toMatchObject({ legs: "aleg", aleg_url: "https://voice.example.test/api/plivo/transfer?callId=call-1", aleg_method: "POST" });
  });

  it("rejects an unsupported queue without making a provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(new PlivoHumanTransferAdapter().transfer({ callId: "call-1", providerCallId: "plivo-call-1", provider: "PLIVO", strategy: "QUEUE", destination: "+14155550124" })).resolves.toMatchObject({ success: false, code: "TRANSFER_STRATEGY_NOT_SUPPORTED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
