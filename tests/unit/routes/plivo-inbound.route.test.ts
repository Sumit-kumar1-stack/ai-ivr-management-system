import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  validateWebhook: vi.fn(),
  resolveConfiguration: vi.fn(),
  createInboundCall: vi.fn(),
  startExecution: vi.fn(),
  updateCall: vi.fn(),
  startRecording: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/plivo-webhook-auth", () => ({
  validatePlivoWebhook: mocks.validateWebhook,
  createPlivoAuthErrorResponse: () => null,
}));
vi.mock("@/lib/logger", () => ({
  createServerLogger: () => ({ debug: mocks.debug, info: mocks.info, warn: mocks.warn, error: mocks.error }),
  maskPhoneNumber: (value: string) => value,
  normalizeError: (error: unknown) => error,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { call: { updateMany: mocks.updateCall, findFirst: vi.fn() } } }));
vi.mock("@/services/calls/inbound-number.service", () => ({ resolveActiveInboundConfiguration: mocks.resolveConfiguration }));
vi.mock("@/services/calls/inbound-call.service", () => ({ createOrGetInboundCall: mocks.createInboundCall }));
vi.mock("@/services/ivr/ivr-graph-executor.service", () => ({ startIVRGraphExecution: mocks.startExecution }));
vi.mock("@/providers/telephony/plivo.provider", async importOriginal => {
  const actual = await importOriginal<typeof import("@/providers/telephony/plivo.provider")>();
  return { ...actual, PlivoProvider: class { startRecording = mocks.startRecording; } };
});

import { POST } from "@/app/api/plivo/inbound/route";

describe("Plivo inbound route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const [key, value] of Object.entries({ PLIVO_AUTH_ID: "MA-test", PLIVO_AUTH_TOKEN: "plivo-test-token", PLIVO_CALLER_ID: "+918031150064", PLIVO_PUBLIC_BASE_URL: "https://voice.test.example", PLIVO_MEDIA_PUBLIC_URL: "wss://media.test.example" })) vi.stubEnv(key, value);
    mocks.validateWebhook.mockResolvedValue({ CallUUID: "call-uuid", From: "918031150099", To: "918031150064" });
    mocks.resolveConfiguration.mockResolvedValue({ configured: true, configuration: { tenantId: "tenant-a", inboundProfileId: "profile-a", ivrFlowVersionId: "version-a", defaultLanguage: "English", knowledgeDocumentIds: [], callbackEnabled: true, transferEnabled: true, requestedRuntime: "GEMINI_LIVE" } });
    mocks.createInboundCall.mockResolvedValue({ callId: "internal-call", tenantId: "tenant-a", created: true });
    mocks.updateCall.mockResolvedValue({ count: 1 });
    mocks.startExecution.mockResolvedValue({ status: "AWAITING_INPUT", currentNodeId: "menu", nextNodeId: null, speechText: "Choose an option.", awaitInput: true, endCall: false, transitionReason: "DTMF_MENU" });
  });

  it("creates and executes an inbound call for a verified Plivo callback whose To omits only the plus marker", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/plivo/inbound", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.resolveConfiguration).toHaveBeenCalledWith({ provider: "PLIVO", calledNumber: "+918031150064" });
    expect(mocks.createInboundCall).toHaveBeenCalledWith(expect.objectContaining({ provider: "PLIVO", providerCallId: "call-uuid", callerNumber: "+918031150099", calledNumber: "+918031150064", tenantId: "tenant-a", inboundProfileId: "profile-a", ivrFlowVersionId: "version-a", requestedRuntime: "GEMINI_LIVE" }));
    expect(mocks.startExecution).toHaveBeenCalledWith("internal-call");
    await expect(response.text()).resolves.toContain('<Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">wss://media.test.example/api/plivo/stream?callId=internal-call&amp;token=');
    expect(mocks.warn).not.toHaveBeenCalledWith(expect.objectContaining({ event: "plivo.inbound.unconfigured_number" }), expect.anything());
  });

  it("keeps a Gemini Live Answer XML non-terminal even when the graph is awaiting the hybrid menu", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/plivo/inbound", { method: "POST" }));

    const xml = await response.text();
    expect(xml).toContain("<Speak>Choose an option.</Speak>");
    expect(xml).toContain('<Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">');
    expect(xml).toContain("wss://media.test.example/api/plivo/stream?callId=internal-call&amp;token=");
    expect(xml).not.toContain("<Wait");
    expect(xml).not.toContain("<GetDigits");
    expect(xml).not.toContain("<Hangup/>");
  });
});
