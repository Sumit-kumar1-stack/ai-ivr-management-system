import { describe, expect, it, vi } from "vitest";
import { ProviderFactory } from "@/providers/telephony/provider.factory";
import { normalizePlivoInboundPayload, normalizePlivoStatusPayload, PlivoProvider } from "@/providers/telephony/plivo.provider";
import { plivoXmlResponse } from "@/app/api/plivo/inbound/route";

const env = { PLIVO_AUTH_ID: "MA-test", PLIVO_AUTH_TOKEN: "plivo-test-token", PLIVO_CALLER_ID: "+14155550123", PLIVO_PUBLIC_BASE_URL: "https://voice.test.example", PLIVO_MEDIA_PUBLIC_URL: "wss://media.test.example" };

describe("Plivo provider", () => {
  it("is selected by the existing provider factory", () => {
    vi.stubEnv("TELEPHONY_PROVIDER", "plivo");
    expect(ProviderFactory.getProvider()).toBeInstanceOf(PlivoProvider);
  });

  it("uses CallUUID and Plivo status names without a provider-specific graph", () => {
    expect(normalizePlivoInboundPayload({ CallUUID: "uuid-1", From: "+14155550124", To: "+14155550123" })).toEqual({ providerCallId: "uuid-1", callerNumber: "+14155550124", calledNumber: "+14155550123" });
    expect(normalizePlivoStatusPayload({ CallUUID: "uuid-1", CallStatus: "completed", Duration: "12", HangupCauseName: "End Of XML Instructions", HangupCauseCode: "4010", HangupSource: "Plivo" })).toEqual({ providerCallId: "uuid-1", status: "completed", duration: 12, hangupCauseName: "End Of XML Instructions", hangupCauseCode: 4010, hangupSource: "Plivo" });
  });

  it("keeps the outbound request UUID out of providerCallId until CallUUID arrives", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ request_uuid: "request-uuid" }), { status: 202 })));
    const result = await new PlivoProvider().makeCall({ callId: "internal-call", campaignId: "campaign", contactId: "contact", contactPhone: "+14155550124", to: "+14155550124", from: "+14155550123", language: "English", script: "Hello" });
    expect(result).toMatchObject({ callId: "request-uuid", providerCallId: null, status: "queued" });
  });

  it("uses the configured public WSS media origin for the Plivo stream endpoint", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await new PlivoProvider().startBidirectionalStream("internal-call", "call-uuid");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.service_url).toMatch(/^wss:\/\/media\.test\.example\/api\/plivo\/stream\?callId=internal-call&token=.+$/);
    expect(body.service_url).not.toMatch(/localhost|127\\.0\\.0\\.1/);
  });

  it("builds GetDigits callbacks from the configured public origin, never the incoming internal URL", async () => {
    for (const [key, value] of Object.entries({ ...env, PLIVO_PUBLIC_BASE_URL: "https://obviously-ideal-roughly-always.trycloudflare.com" })) vi.stubEnv(key, value);
    const response = plivoXmlResponse("Choose an option.", false, new URL("http://localhost:3000/api/plivo/inbound"), "internal-call", { status: "AWAITING_INPUT", currentNodeId: "menu", nextNodeId: null, speechText: "Choose an option.", awaitInput: true, endCall: false, transitionReason: "DTMF_MENU" });
    const xml = await response.text();
    expect(xml).toContain("https://obviously-ideal-roughly-always.trycloudflare.com/api/plivo/input?callId=internal-call");
    expect(xml).not.toMatch(/localhost|127\\.0\\.0\\.1/);
  });

  it("builds an XML-owned Gemini Live stream that keeps the call alive", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const response = plivoXmlResponse("Welcome.", false, new URL("http://localhost:3000/api/plivo/inbound"), "internal-call", undefined, "GEMINI_LIVE");
    const xml = await response.text();
    expect(xml).toContain('<Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">');
    expect(xml).toContain("wss://media.test.example/api/plivo/stream?callId=internal-call&amp;token=");
    expect(xml).not.toContain("<Wait");
    expect(xml).not.toContain("<Hangup");
  });

  it("builds an XML-owned CASCADED stream for STANDARD voice campaigns", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const response = plivoXmlResponse("Welcome to standard voice.", false, new URL("http://localhost:3000/api/plivo/outbound/answer"), "internal-call-cascaded", undefined, "CASCADED");
    const xml = await response.text();
    expect(xml).toContain("<Speak>Welcome to standard voice.</Speak>");
    expect(xml).toContain('<Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">');
    expect(xml).toContain("wss://media.test.example/api/plivo/stream?callId=internal-call-cascaded&amp;token=");
    expect(xml).not.toContain(env.PLIVO_AUTH_TOKEN);
    expect(xml).not.toContain("<Hangup");
  });

  it("supports STANDARD alias and produces signed WSS stream URL", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const response = plivoXmlResponse("Hello.", false, new URL("http://localhost:3000/api/plivo/outbound/answer"), "call-std", undefined, "STANDARD");
    const xml = await response.text();
    expect(xml).toContain('<Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">wss://media.test.example/api/plivo/stream?callId=call-std&amp;token=');
  });

  it("does not emit the legacy XML DTMF callback while Gemini Live owns the call", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const response = plivoXmlResponse("Choose an option.", false, new URL("http://localhost:3000/api/plivo/inbound"), "internal-call", { status: "AWAITING_INPUT", currentNodeId: "menu", nextNodeId: null, speechText: "Choose an option.", awaitInput: true, endCall: false, transitionReason: "DTMF_MENU" }, "GEMINI_LIVE");
    const xml = await response.text();

    expect(xml).toContain("<Stream");
    expect(xml).not.toContain("/api/plivo/input");
    expect(xml).not.toContain("<GetDigits");
    expect(xml).not.toContain("<GetInput");
    expect(new PlivoProvider().capabilities.supportsRealtimeDtmfDuringMedia).toBe(true);
  });

  it("does not emit the legacy XML DTMF callback while CASCADED owns the call", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const response = plivoXmlResponse("Choose an option.", false, new URL("http://localhost:3000/api/plivo/inbound"), "internal-call", { status: "AWAITING_INPUT", currentNodeId: "menu", nextNodeId: null, speechText: "Choose an option.", awaitInput: true, endCall: false, transitionReason: "DTMF_MENU" }, "CASCADED");
    const xml = await response.text();

    expect(xml).toContain("<Stream");
    expect(xml).not.toContain("/api/plivo/input");
    expect(xml).not.toContain("<GetDigits");
    expect(xml).not.toContain("<GetInput");
  });

  it("uses documented XML GetInput for zero-Gemini DTMF or speech before a staged Gemini Live session", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const response = plivoXmlResponse("Welcome.", false, new URL("http://localhost:3000/api/plivo/inbound"), "internal-call", { status: "AWAITING_INPUT", currentNodeId: "entry-menu", nextNodeId: null, speechText: "Welcome.", awaitInput: true, endCall: false, transitionReason: "DEFAULT", currentNodeKind: "HYBRID_MENU", entryInputStage: true, entryPrompt: "Press 1 for loans.", entryTimeoutPrompt: "Connecting you to our AI assistant.", entryTimeoutSeconds: 12 }, "GEMINI_LIVE");
    const xml = await response.text();

    expect(xml).toContain('<GetInput action="https://voice.test.example/api/plivo/input?callId=internal-call" method="POST" inputType="dtmf speech" numDigits="1" executionTimeout="12" startInputTimeout="12" speechModel="command_and_search" retries="1">');
    expect(xml).toContain("Press 1 for loans.");
    expect(xml).toContain('<Redirect method="POST">https://voice.test.example/api/plivo/input?callId=internal-call&amp;timeout=1</Redirect>');
    expect(xml).not.toContain("<Stream");
  });

  it("uses documented XML GetInput for DTMF or speech before a staged CASCADED session", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const response = plivoXmlResponse("Welcome.", false, new URL("http://localhost:3000/api/plivo/inbound"), "internal-call", { status: "AWAITING_INPUT", currentNodeId: "entry-menu", nextNodeId: null, speechText: "Welcome.", awaitInput: true, endCall: false, transitionReason: "DEFAULT", currentNodeKind: "HYBRID_MENU", entryInputStage: true, entryPrompt: "Press 1 for loans.", entryTimeoutPrompt: "Connecting you to our AI assistant.", entryTimeoutSeconds: 12 }, "CASCADED");
    const xml = await response.text();

    expect(xml).toContain('<GetInput action="https://voice.test.example/api/plivo/input?callId=internal-call" method="POST" inputType="dtmf speech" numDigits="1" executionTimeout="12" startInputTimeout="12" speechModel="command_and_search" retries="1">');
    expect(xml).toContain("Press 1 for loans.");
    expect(xml).toContain('<Redirect method="POST">https://voice.test.example/api/plivo/input?callId=internal-call&amp;timeout=1</Redirect>');
    expect(xml).not.toContain("<Stream");
  });

  it("starts a mono recording with a signed callback and resolves media only through the authenticated API", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recording_url: "https://s3.amazonaws.com/recordings/recording-1.mp3" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new PlivoProvider();
    await provider.startRecording("internal-call", "call-uuid");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.plivo.com/v1/Account/MA-test/Call/call-uuid/Record/");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ time_limit: 14_400, file_format: "mp3", record_channel_type: "mono", callback_method: "POST", callback_url: "https://voice.test.example/api/plivo/recording?callId=internal-call" });
    await expect(provider.getRecordingMediaUrl("recording-1")).resolves.toMatchObject({ protocol: "https:", hostname: "s3.amazonaws.com" });
  });
});
