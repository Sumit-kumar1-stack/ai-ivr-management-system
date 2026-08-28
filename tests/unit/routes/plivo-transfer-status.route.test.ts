import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ validateWebhook: vi.fn(), findFirst: vi.fn(), apply: vi.fn(), persist: vi.fn(), persistCallbackOffer: vi.fn(), info: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/plivo-webhook-auth", () => ({ validatePlivoWebhook: mocks.validateWebhook, createPlivoAuthErrorResponse: (error: unknown) => error instanceof Error && error.message === "unsigned" ? new Response(null, { status: 403 }) : null }));
vi.mock("@/lib/prisma", () => ({ prisma: { call: { findFirst: mocks.findFirst } } }));
vi.mock("@/providers/telephony/plivo.provider", () => ({ normalizePlivoInboundPayload: (payload: Record<string, unknown>) => ({ providerCallId: payload.CallUUID ?? null }) }));
vi.mock("@/services/telephony/human-transfer-lifecycle.service", () => ({ applyHumanTransferProviderEvent: mocks.apply }));
vi.mock("@/services/telephony/agent-transfer-persistence.service", () => ({ persistTransferLifecycle: mocks.persist, persistCallbackFollowUpOffer: mocks.persistCallbackOffer }));
vi.mock("@/lib/logger", () => ({ createServerLogger: () => ({ info: mocks.info, error: mocks.error }), normalizeError: (error: unknown) => error }));

import { POST } from "@/app/api/plivo/transfer/status/route";

describe("Plivo transfer Dial status route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.findFirst.mockResolvedValue({ id: "call-1" }); mocks.apply.mockResolvedValue({ applied: true }); });

  it("accepts a signed, bound Dial connection and records CONNECTED", async () => {
    mocks.validateWebhook.mockResolvedValue({ CallUUID: "aleg-1", DialBLegUUID: "bleg-1", DialAction: "connected" });
    const response = await POST(new NextRequest("https://voice.example.test/api/plivo/transfer/status?callId=call-1", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "call-1", provider: "PLIVO", providerCallId: "aleg-1" }, select: { id: true, inboundProfile: { select: { callbackEnabled: true } } } });
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ callId: "call-1", childProviderCallId: "bleg-1", status: "ANSWERED" }));
    expect(mocks.persist).toHaveBeenCalledWith("call-1", "CONNECTED", { provider: "PLIVO" });
  });

  it("rejects unsigned callbacks and signed callbacks bound to another call", async () => {
    mocks.validateWebhook.mockRejectedValue(new Error("unsigned"));
    expect((await POST(new NextRequest("https://voice.example.test/api/plivo/transfer/status?callId=call-1", { method: "POST" }))).status).toBe(403);
    mocks.validateWebhook.mockResolvedValue({ CallUUID: "wrong-aleg", DialBLegUUID: "bleg-1", DialAction: "connected" });
    mocks.findFirst.mockResolvedValue(null);
    expect((await POST(new NextRequest("https://voice.example.test/api/plivo/transfer/status?callId=call-1", { method: "POST" }))).status).toBe(403);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("does not write a second lifecycle record for duplicate callbacks", async () => {
    mocks.validateWebhook.mockResolvedValue({ CallUUID: "aleg-1", DialBLegUUID: "bleg-1", DialAction: "connected" });
    mocks.apply.mockResolvedValue({ applied: false });
    const response = await POST(new NextRequest("https://voice.example.test/api/plivo/transfer/status?callId=call-1", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
