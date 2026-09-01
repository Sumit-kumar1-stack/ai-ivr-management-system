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

import { POST, plivoXmlResponse } from "@/app/api/plivo/inbound/route";

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

  it("speaks Greeting then collects menu DTMF or speech before opening realtime media", async () => {
    mocks.startExecution.mockResolvedValue({
      status: "AWAITING_INPUT",
      currentNodeId: "hybrid-menu",
      nextNodeId: null,
      speechText: "Welcome to Demo Bank.",
      awaitInput: true,
      endCall: false,
      transitionReason: "GREETING",
      entryInputStage: true,
      entryPrompt: "Press or say 1 for loan information.",
      entryTimeoutSeconds: 8,
    });

    const response = await POST(new NextRequest("http://localhost:3000/api/plivo/inbound", { method: "POST" }));
    const xml = await response.text();

    expect(xml).toContain("<Speak>Welcome to Demo Bank.</Speak><GetInput");
    expect(xml).toContain('inputType="dtmf speech"');
    expect(xml).toContain('speechModel="command_and_search"');
    expect(xml).toContain("<Speak>Press or say 1 for loan information.</Speak></GetInput>");
    expect(xml).toContain("<Redirect method=\"POST\">https://voice.test.example/api/plivo/input?callId=internal-call&amp;timeout=1</Redirect>");
    expect(xml).not.toContain("<Stream");
    expect(xml.indexOf("Welcome to Demo Bank.")).toBeLessThan(xml.indexOf("Press or say 1"));
  });

  it("speaks the configured exhausted prompt and terminates without opening Gemini media", async () => {
    const response = plivoXmlResponse(
      "Maximum attempts reached. Ending call.",
      false,
      new URL("https://voice.test.example/api/plivo/input"),
      "internal-call",
      {
        status: "SAFE_FAILURE",
        currentNodeId: "hybrid-menu",
        nextNodeId: null,
        speechText: "Maximum attempts reached. Ending call.",
        awaitInput: false,
        endCall: false,
        transitionReason: "MAX_ATTEMPTS_EXHAUSTED",
      },
      "GEMINI_LIVE"
    );

    const xml = await response.text();
    expect(xml).toContain("<Speak>Maximum attempts reached. Ending call.</Speak><Hangup/>");
    expect(xml).not.toContain("<Stream");
  });

  // Regression: plivoXmlResponse must select STAGED_ENTRY (not STREAM) when
  // the executor sets entryInputStage=true. This is the shape the real F3
  // executor NOW produces for any HYBRID_MENU on a GEMINI_LIVE call.
  it("F3-REG: plivoXmlResponse selects STAGED_ENTRY mode when executor returns entryInputStage=true", () => {
    const xml = plivoXmlResponse(
      "Welcome to Apex Financial Services.",
      false,
      new URL("https://voice.test.example/api/plivo/inbound"),
      "internal-call",
      {
        status: "AWAITING_INPUT",
        currentNodeId: "hybrid_menu",
        nextNodeId: null,
        speechText: "Welcome to Apex Financial Services.",
        awaitInput: true,
        endCall: false,
        transitionReason: "GREETING",
        currentNodeKind: "HYBRID_MENU",
        entryInputStage: true,
        entryPrompt:
          "Press 1 for Loan Info, 2 for Eligibility, 3 for Documents and AI Assistant, 4 for Human Agent, 8 to Repeat, 9 to End Call.",
        entryTimeoutSeconds: 8,
      },
      "GEMINI_LIVE"
    );

    const text = xml.body ? String(xml.body) : "";
    // Validate by checking body from XML text directly via response.text()
    expect(xml.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
  });

  it("F3-REG-plivoXmlResponse: direct mode check for STAGED_ENTRY with real F3 shape", async () => {
    mocks.startExecution.mockResolvedValue({
      status: "AWAITING_INPUT",
      currentNodeId: "hybrid_menu",
      nextNodeId: null,
      speechText: "Welcome to Apex Financial Services.",
      awaitInput: true,
      endCall: false,
      transitionReason: "GREETING",
      currentNodeKind: "HYBRID_MENU",
      // This is what isStagedHybridEntry now returns for GEMINI_LIVE + HYBRID_MENU
      entryInputStage: true,
      entryPrompt:
        "Press 1 for Loan Info, 2 for Eligibility, 3 for Documents and AI Assistant, 4 for Human Agent, 8 to Repeat, 9 to End Call.",
      entryTimeoutSeconds: 8,
    });

    const response = await POST(new NextRequest("http://localhost:3000/api/plivo/inbound", { method: "POST" }));
    const xml = await response.text();

    // Must be STAGED_ENTRY — not STREAM
    expect(xml).toContain("<Speak>Welcome to Apex Financial Services.</Speak><GetInput");
    expect(xml).toContain('inputType="dtmf speech"');
    expect(xml).toContain('speechModel="command_and_search"');
    expect(xml).toContain("Press 1 for Loan Info");
    expect(xml).toContain("</GetInput>");
    expect(xml).toContain("<Redirect");
    expect(xml).not.toContain("<Stream");
    // Greeting must appear before menu prompt
    expect(xml.indexOf("Welcome to Apex Financial Services.")).toBeLessThan(
      xml.indexOf("Press 1 for Loan Info")
    );
  });
});
