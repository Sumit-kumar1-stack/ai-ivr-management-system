import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  validateWebhook: vi.fn(),
  findFirst: vi.fn(),
  routeInput: vi.fn(),
  xmlResponse: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/plivo-webhook-auth", () => ({
  validatePlivoWebhook: mocks.validateWebhook,
  createPlivoAuthErrorResponse: () => null,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { call: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/logger", () => ({
  createServerLogger: () => ({ info: mocks.info, error: mocks.error }),
  normalizeError: (error: unknown) => error,
}));
vi.mock("@/providers/telephony/plivo.provider", () => ({
  normalizePlivoInboundPayload: (payload: Record<string, unknown>) => ({ providerCallId: payload.CallUUID ?? null }),
  PlivoProvider: class { normalizeDtmf(value: unknown) { return typeof value === "string" && /^[0-9*#]$/.test(value) ? value : null; } },
}));
vi.mock("@/services/conversations/realtime-input.service", () => ({ routeRealtimeCallInput: mocks.routeInput }));
vi.mock("@/app/api/plivo/inbound/route", () => ({ plivoXmlResponse: mocks.xmlResponse }));

import { POST } from "@/app/api/plivo/input/route";

describe("Plivo legacy XML input route", () => {
  it("rejects a signed callback unless its exact call ID, provider CallUUID, and provider bind an existing call", async () => {
    mocks.validateWebhook.mockResolvedValue({ CallUUID: "other-provider-call", Digits: "1" });
    mocks.findFirst.mockResolvedValue(null);

    const response = await POST(new NextRequest("https://voice.test.example/api/plivo/input?callId=internal-call", { method: "POST" }));

    expect(response.status).toBe(403);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "internal-call", providerCallId: "other-provider-call", provider: "PLIVO" },
      select: { id: true, tenantId: true, requestedRuntime: true },
    });
    expect(mocks.routeInput).not.toHaveBeenCalled();
  });

  it("routes a verified XML callback only for the bound internal call", async () => {
    mocks.validateWebhook.mockResolvedValue({ CallUUID: "provider-call", Digits: "1" });
    mocks.findFirst.mockResolvedValue({ id: "internal-call", tenantId: "tenant-a" });
    mocks.routeInput.mockResolvedValue({ handled: true, speechText: "Personal Loan.", endCall: false, graphExecution: null });
    mocks.xmlResponse.mockReturnValue(new NextResponse("<Response/>", { status: 200 }));

    const response = await POST(new NextRequest("https://voice.test.example/api/plivo/input?callId=internal-call", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.routeInput).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DTMF", callId: "internal-call", provider: "PLIVO", digit: "1" }),
      { deliverOutput: false }
    );
  });
});
