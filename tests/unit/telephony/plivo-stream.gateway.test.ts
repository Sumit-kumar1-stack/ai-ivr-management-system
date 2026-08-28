import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gatewayHandle: vi.fn(),
  get: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/providers/telephony/twilio-stream.gateway", () => ({ TwilioStreamGateway: { handle: mocks.gatewayHandle } }));
vi.mock("@/providers/telephony/audio-session.service", () => ({ AudioSessionService: { get: mocks.get } }));
vi.mock("@/lib/logger", () => ({ createServerLogger: () => mocks, normalizeError: (error: unknown) => error }));

import { PlivoStreamGateway } from "@/providers/telephony/plivo-stream.gateway";

const CALL_ID = "internal-call";
const PROVIDER_CALL_ID = "provider-call-uuid";
const STREAM_ID = "plivo-stream-id";

function socket() {
  return { close: vi.fn(), send: vi.fn(), readyState: 1 };
}

function start() {
  return JSON.stringify({ event: "start", sequenceNumber: 1, start: { callId: PROVIDER_CALL_ID, streamId: STREAM_ID, mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000 } } });
}

describe("Plivo stream gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockReturnValue({ callId: CALL_ID, requestedRuntime: "GEMINI_LIVE", effectiveRuntime: "GEMINI_LIVE" });
    mocks.gatewayHandle.mockResolvedValue(undefined);
  });

  it("registers the shared session from Plivo's documented start.callId/start.streamId frame", async () => {
    const connection = socket();
    await PlivoStreamGateway.handle(connection as never, start(), CALL_ID);

    expect(mocks.gatewayHandle).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(mocks.gatewayHandle.mock.calls[0]?.[1]))).toMatchObject({ event: "start", streamSid: STREAM_ID, start: { callSid: PROVIDER_CALL_ID, customParameters: { callId: CALL_ID } } });
    expect(mocks.info).toHaveBeenCalledWith(expect.objectContaining({ event: "plivo.stream.session_registered", requestedRuntime: "GEMINI_LIVE", effectiveRuntime: "GEMINI_LIVE" }), expect.any(String));
    expect(connection.close).not.toHaveBeenCalled();
  });

  it("forwards mu-law media only after the authenticated stream start has registered", async () => {
    const connection = socket();
    const payload = Buffer.from([0xff, 0x7f]).toString("base64");
    await PlivoStreamGateway.handle(connection as never, start(), CALL_ID);
    await PlivoStreamGateway.handle(connection as never, JSON.stringify({ event: "media", streamId: STREAM_ID, media: { payload } }), CALL_ID);

    expect(JSON.parse(String(mocks.gatewayHandle.mock.calls[1]?.[1]))).toEqual({ event: "media", streamSid: STREAM_ID, media: { payload } });
    expect(mocks.warn).not.toHaveBeenCalledWith(expect.objectContaining({ event: "plivo.stream.media_rejected", reason: "start_not_registered" }), expect.any(String));
  });

  it("does not route an undocumented DTMF stream frame or close the active media session", async () => {
    const connection = socket();
    await PlivoStreamGateway.handle(connection as never, start(), CALL_ID);
    await PlivoStreamGateway.handle(connection as never, JSON.stringify({ event: "dtmf", streamId: STREAM_ID, dtmf: { digit: "1" } }), CALL_ID);

    expect(mocks.gatewayHandle).toHaveBeenCalledTimes(1);
    expect(connection.close).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "plivo.stream.dtmf_unsupported" }),
      expect.any(String)
    );
  });

  it("rejects media before a valid start rather than attaching unauthenticated frames", async () => {
    const connection = socket();
    await PlivoStreamGateway.handle(connection as never, JSON.stringify({ event: "media", streamId: STREAM_ID, media: { payload: Buffer.from([1]).toString("base64") } }), CALL_ID);

    expect(mocks.gatewayHandle).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ event: "plivo.stream.media_rejected", reason: "start_not_registered" }), expect.any(String));
  });

  it("emits Plivo's playAudio envelope for shared runtime outbound mu-law", async () => {
    const connection = socket();
    const payload = Buffer.from([0xff]).toString("base64");
    mocks.gatewayHandle.mockImplementation(async (wrapped, raw) => {
      if (JSON.parse(String(raw)).event === "start") (wrapped as { send: (message: string) => void }).send(JSON.stringify({ event: "media", streamSid: STREAM_ID, media: { payload } }));
    });

    await PlivoStreamGateway.handle(connection as never, start(), CALL_ID);

    expect(JSON.parse(String(connection.send.mock.calls[0]?.[0]))).toEqual({ event: "playAudio", media: { contentType: "audio/x-mulaw", sampleRate: 8000, payload } });
    expect(mocks.debug).toHaveBeenCalledWith(expect.objectContaining({ event: "plivo.stream.play_audio_sent", internalCallId: CALL_ID, payloadBytes: 1, contentType: "audio/x-mulaw", sampleRate: 8000 }), expect.any(String));
  });

  it("maps clear playback to Plivo clearAudio without changing the stream transport", async () => {
    const connection = socket();
    mocks.gatewayHandle.mockImplementation(async (wrapped, raw) => {
      if (JSON.parse(String(raw)).event === "start") (wrapped as { send: (message: string) => void }).send(JSON.stringify({ event: "clear", streamSid: STREAM_ID }));
    });
    await PlivoStreamGateway.handle(connection as never, start(), CALL_ID);
    expect(JSON.parse(String(connection.send.mock.calls[0]?.[0]))).toEqual({ event: "clearAudio", streamId: STREAM_ID });
  });

  it("prevents late playAudio when the WebSocket is already closed", async () => {
    const connection = { ...socket(), readyState: 3 };
    mocks.gatewayHandle.mockImplementation(async (wrapped, raw) => {
      if (JSON.parse(String(raw)).event === "start") (wrapped as { send: (message: string) => void }).send(JSON.stringify({ event: "media", streamSid: STREAM_ID, media: { payload: Buffer.from([1]).toString("base64") } }));
    });
    await PlivoStreamGateway.handle(connection as never, start(), CALL_ID);
    expect(connection.send).not.toHaveBeenCalled();
  });

  it("forwards stop for cleanup and rejects later media on the closed stream", async () => {
    const connection = socket();
    await PlivoStreamGateway.handle(connection as never, start(), CALL_ID);
    await PlivoStreamGateway.handle(connection as never, JSON.stringify({ event: "stop", streamId: STREAM_ID }), CALL_ID);
    await PlivoStreamGateway.handle(connection as never, JSON.stringify({ event: "media", streamId: STREAM_ID, media: { payload: Buffer.from([1]).toString("base64") } }), CALL_ID);

    expect(JSON.parse(String(mocks.gatewayHandle.mock.calls[1]?.[1]))).toEqual({ event: "stop", streamSid: STREAM_ID });
    expect(mocks.gatewayHandle).toHaveBeenCalledTimes(2);
  });

  it("cleans up the shared runtime when the socket closes before a stop frame", async () => {
    const connection = socket();
    await PlivoStreamGateway.handle(connection as never, start(), CALL_ID);
    await PlivoStreamGateway.close(connection as never, 1006, "");

    expect(JSON.parse(String(mocks.gatewayHandle.mock.calls[1]?.[1]))).toEqual({ event: "stop", streamSid: STREAM_ID });
    expect(mocks.info).toHaveBeenCalledWith(expect.objectContaining({ event: "plivo.stream.closed", closeCode: 1006, sessionRegistered: true, internalCallId: CALL_ID }), expect.any(String));
    expect(mocks.info).toHaveBeenCalledWith(expect.objectContaining({ event: "plivo.stream.session_cleaned_up", source: "socket_close", internalCallId: CALL_ID }), expect.any(String));
  });
});
