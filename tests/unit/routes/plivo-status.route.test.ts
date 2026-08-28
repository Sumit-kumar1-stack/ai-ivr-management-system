import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateWebhook: vi.fn(),
  processStatus: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/plivo-webhook-auth", () => ({
  validatePlivoWebhook: mocks.validateWebhook,
  createPlivoAuthErrorResponse: () => null,
}));
vi.mock("@/lib/logger", () => ({
  createServerLogger: () => ({ info: mocks.info, error: mocks.error }),
  normalizeError: (error: unknown) => error,
}));
vi.mock("@/services/telephony/status-callback.service", () => ({
  processProviderStatusCallback: mocks.processStatus,
}));

import { POST } from "@/app/api/plivo/status/route";

describe("Plivo status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processStatus.mockResolvedValue({ callId: "internal-call", duplicate: false });
  });

  it("records provider hangup evidence without attempting a second REST media stream", async () => {
    mocks.validateWebhook.mockResolvedValue({
      CallUUID: "provider-call-uuid",
      CallStatus: "completed",
      Duration: "8",
      HangupCauseName: "End Of XML Instructions",
      HangupCauseCode: "4010",
      HangupSource: "Plivo",
    });

    const response = await POST(new NextRequest("https://voice.test.example/api/plivo/status?callId=internal-call", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.processStatus).toHaveBeenCalledWith({ callId: "internal-call", providerCallId: "provider-call-uuid", status: "completed", duration: 8 });
    expect(mocks.info).toHaveBeenCalledWith(expect.objectContaining({ event: "plivo.status.received", internalCallId: "internal-call", hangupCauseName: "End Of XML Instructions", hangupCauseCode: 4010, hangupSource: "Plivo", durationSeconds: 8 }), expect.any(String));
  });
});
