import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  gatewayHandle: vi.fn(),
  get: vi.fn(),
  pcmToMulaw: vi.fn(),
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { call: { findFirst: mocks.findFirst } } }));
vi.mock("@/providers/telephony/twilio-stream.gateway", () => ({ TwilioStreamGateway: { handle: mocks.gatewayHandle } }));
vi.mock("@/providers/telephony/audio-session.service", () => ({ AudioSessionService: { get: mocks.get } }));
vi.mock("@/services/voice/audio-converter.service", () => ({ AudioConverter: { pcm16kToMulaw8k: mocks.pcmToMulaw } }));
vi.mock("@/lib/logger", () => ({
  createCallLogger: vi.fn(() => mocks),
  createServerLogger: vi.fn(() => mocks),
  normalizeError: vi.fn(error => ({ message: error instanceof Error ? error.message : String(error) })),
}));

import { ExotelStreamGateway } from "@/providers/telephony/exotel-stream.gateway";

function socket() {
  return { close: vi.fn() };
}

function startEvent(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ event: "start", start: { stream_sid: "MS-exo", call_sid: "exo-call", media_format: { encoding: "audio/x-raw", sample_rate: "8000", bit_rate: "16" }, ...overrides } });
}

describe("Exotel AgentStream gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: "call-1", tenantId: "tenant-1" });
    mocks.get.mockReturnValue(undefined);
    mocks.gatewayHandle.mockResolvedValue(undefined);
    mocks.pcmToMulaw.mockReturnValue(Buffer.from("normalised"));
  });

  it("normalizes a documented start event into the shared media runtime", async () => {
    const connection = socket();
    await ExotelStreamGateway.handle(connection as never, startEvent());
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { provider: "EXOTEL", providerCallId: "exo-call" }, select: { id: true, tenantId: true } });
    expect(mocks.gatewayHandle).toHaveBeenCalledWith(connection, expect.stringContaining('"mediaFormat":"PCM_8K"'));
    expect(mocks.gatewayHandle.mock.calls[0]?.[1]).toContain('"callId":"call-1"');
  });

  it("normalizes PCM16 input before forwarding it to the shared STT/Gemini path", async () => {
    const connection = socket();
    await ExotelStreamGateway.handle(connection as never, JSON.stringify({ event: "media", stream_sid: "MS-exo", media: { payload: Buffer.from([1, 0]).toString("base64") } }));
    expect(mocks.pcmToMulaw).toHaveBeenCalledWith(Buffer.from([1, 0]));
    expect(mocks.gatewayHandle).toHaveBeenCalledWith(connection, expect.stringContaining(Buffer.from("normalised").toString("base64")));
  });

  it("forwards documented DTMF and stop lifecycle events without duplicating IVR logic", async () => {
    const connection = socket();
    await ExotelStreamGateway.handle(connection as never, JSON.stringify({ event: "dtmf", stream_sid: "MS-exo", dtmf: { digit: "4" } }));
    await ExotelStreamGateway.handle(connection as never, JSON.stringify({ event: "stop", stream_sid: "MS-exo" }));
    expect(mocks.gatewayHandle).toHaveBeenCalledTimes(2);
    expect(mocks.gatewayHandle.mock.calls[0]?.[1]).toContain('"dtmf"');
    expect(mocks.gatewayHandle.mock.calls[1]?.[1]).toContain('"stop"');
  });

  it("rejects an unsupported media format and ignores duplicate starts", async () => {
    const connection = socket();
    await ExotelStreamGateway.handle(connection as never, startEvent({ media_format: { encoding: "audio/ulaw", sample_rate: "8000", bit_rate: "8" } }));
    expect(connection.close).toHaveBeenCalledWith(1008, "Expected raw PCM16 mono at 8000 Hz");
    mocks.get.mockReturnValue({ callId: "call-1" });
    await ExotelStreamGateway.handle(connection as never, startEvent());
    expect(mocks.gatewayHandle).not.toHaveBeenCalled();
  });

  it("closes unknown AgentStream calls rather than attaching them to another session", async () => {
    const connection = socket();
    mocks.findFirst.mockResolvedValue(null);
    await ExotelStreamGateway.handle(connection as never, startEvent());
    expect(connection.close).toHaveBeenCalledWith(1008, "Call not found");
    expect(mocks.gatewayHandle).not.toHaveBeenCalled();
  });
});
