import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateWebhook: vi.fn(),
  findCall: vi.fn(),
  updateCall: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/plivo-webhook-auth", () => ({
  validatePlivoWebhook: mocks.validateWebhook,
  createPlivoAuthErrorResponse: () => null,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { call: { findFirst: mocks.findCall, updateMany: mocks.updateCall } },
}));
vi.mock("@/lib/logger", () => ({
  createServerLogger: () => ({ info: mocks.info, warn: mocks.warn, error: mocks.error }),
  createCallLogger: () => ({ info: mocks.info }),
  getDurationMs: () => 1,
  normalizeError: (error: unknown) => error,
}));

import { POST } from "@/app/api/plivo/recording/route";

describe("Plivo recording callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCall.mockResolvedValue({
      id: "internal-call",
      campaignId: null,
      campaignRunId: null,
      contactId: null,
      recordingId: null,
      recordingUrl: null,
      attemptNumber: 1,
    });
    mocks.updateCall.mockResolvedValue({ count: 1 });
  });

  it("accepts the documented active Record API callback fields", async () => {
    mocks.validateWebhook.mockResolvedValue({
      call_uuid: "call-uuid",
      recording_id: "recording-id",
      recording_duration: "13",
      recording_duration_ms: "13001",
      record_url: "https://media.plivo.example/private.mp3",
    });

    const response = await POST(new NextRequest("https://voice.test.example/api/plivo/recording?callId=internal-call", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.findCall).toHaveBeenCalledWith(expect.objectContaining({ where: { provider: "PLIVO", providerCallId: "call-uuid" } }));
    expect(mocks.updateCall).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recordingId: "recording-id", recordingUrl: "plivo-recording:recording-id", recordingStatus: "AVAILABLE", duration: 13 }) }));
  });

  it("uses a present official alias when an empty duplicate field precedes it", async () => {
    mocks.validateWebhook.mockResolvedValue({ call_uuid: "", CallUUID: "call-uuid", recording_id: "", RecordingID: "recording-id" });

    const response = await POST(new NextRequest("https://voice.test.example/api/plivo/recording?callId=internal-call", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.updateCall).toHaveBeenCalled();
  });

  it("extracts authoritative identifiers from the live callback's nested response JSON", async () => {
    mocks.validateWebhook.mockResolvedValue({ callId: "internal-call", response: JSON.stringify({ call_uuid: "call-uuid", recording_id: "recording-id", recording_duration: 13 }) });

    const response = await POST(new NextRequest("https://voice.test.example/api/plivo/recording?callId=internal-call", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.updateCall).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recordingId: "recording-id", duration: 13 }) }));
  });
});
