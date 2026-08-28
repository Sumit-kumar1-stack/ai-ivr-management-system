import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  lifecycle: vi.fn(),
  graph: vi.fn(),
  callFind: vi.fn(),
  xml: vi.fn(),
}));

vi.mock("@/lib/plivo-webhook-auth", () => ({
  validatePlivoWebhook: mocks.validate,
  createPlivoAuthErrorResponse: (error: unknown) =>
    error instanceof Error && error.message === "invalid-signature"
      ? NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
      : null,
}));
vi.mock("@/services/communication/communication-outbound-lifecycle.service", () => ({
  processOutboundPlivoLifecycle: mocks.lifecycle,
}));
vi.mock("@/services/ivr/ivr-graph-executor.service", () => ({ startIVRGraphExecution: mocks.graph }));
vi.mock("@/lib/prisma", () => ({ prisma: { call: { findUnique: mocks.callFind } } }));
vi.mock("@/app/api/plivo/inbound/route", () => ({
  plivoXmlResponse: mocks.xml,
}));

import { POST as answer } from "@/app/api/plivo/outbound/answer/route";
import { POST as status } from "@/app/api/plivo/outbound/status/route";

function request(path: string): NextRequest {
  return new NextRequest(`https://voice.example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "CallUUID=call-uuid-1&CallStatus=completed&HangupCauseName=NORMAL_CLEARING",
  });
}

describe("signed Plivo outbound callback routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.xml.mockImplementation(() => new NextResponse("<Response/>", {
      headers: { "Content-Type": "application/xml" },
    }));
    mocks.validate.mockResolvedValue({
      CallUUID: "call-uuid-1",
      CallStatus: "completed",
      HangupCauseName: "NORMAL_CLEARING",
    });
    mocks.lifecycle.mockResolvedValue({
      matched: true,
      ignored: false,
      duplicate: false,
      conflict: false,
      callId: "call-1",
      terminal: false,
    });
    mocks.callFind.mockResolvedValue({ requestedRuntime: "GEMINI_LIVE" });
    mocks.graph.mockResolvedValue({
      speechText: "Welcome",
      endCall: false,
      status: "EXECUTED",
      currentNodeId: "start",
      nextNodeId: null,
      awaitInput: false,
      transitionReason: "START",
    });
  });

  it("authenticates and correlates the exact outbound Answer attempt", async () => {
    const response = await answer(request("/api/plivo/outbound/answer?attempt=attempt-1"));
    expect(response.status).toBe(200);
    expect(mocks.lifecycle).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "answered",
    }));
    expect(mocks.graph).toHaveBeenCalledWith("call-1");
    expect(mocks.xml).toHaveBeenCalledWith(
      "Welcome",
      false,
      expect.anything(),
      "call-1",
      expect.any(Object),
      "GEMINI_LIVE"
    );
  });

  it("processes a signed status callback without trusting tenant input", async () => {
    mocks.lifecycle.mockResolvedValue({
      matched: true, ignored: false, duplicate: false, conflict: false, terminal: true,
    });
    const response = await status(request("/api/plivo/outbound/status?attempt=attempt-1&tenant=attacker"));
    expect(response.status).toBe(200);
    expect(mocks.lifecycle).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "completed",
    }));
    expect(mocks.lifecycle.mock.calls[0][0]).not.toHaveProperty("tenantId");
  });

  it.each(["invalid", "missing", "tampered"])("rejects %s signatures without lifecycle mutation", async () => {
    mocks.validate.mockRejectedValue(new Error("invalid-signature"));
    const response = await status(request("/api/plivo/outbound/status?attempt=attempt-1"));
    expect(response.status).toBe(403);
    expect(mocks.lifecycle).not.toHaveBeenCalled();
  });

  it("fails closed on wrong attempts and cross-attempt UUID conflicts", async () => {
    mocks.lifecycle.mockResolvedValueOnce({ matched: false, conflict: false });
    const missing = await status(request("/api/plivo/outbound/status?attempt=wrong-attempt"));
    expect(missing.status).toBe(404);

    mocks.lifecycle.mockResolvedValueOnce({ matched: true, conflict: true });
    const conflict = await status(request("/api/plivo/outbound/status?attempt=attempt-1"));
    expect(conflict.status).toBe(409);
  });

  it("requires an opaque attempt id", async () => {
    const response = await status(request("/api/plivo/outbound/status"));
    expect(response.status).toBe(400);
    expect(mocks.lifecycle).not.toHaveBeenCalled();
  });
});
