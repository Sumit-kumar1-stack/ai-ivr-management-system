import { describe, expect, it } from "vitest";
import { AudioConverter } from "@/services/voice/audio-converter.service";

describe("Exotel AgentStream PCM16 codec adapter", () => {
  it("converts documented PCM16/8k input into the internal mu-law/8k contract", () => {
    const pcm = Buffer.alloc(4);
    pcm.writeInt16LE(0, 0);
    pcm.writeInt16LE(1_000, 2);
    const mulaw = AudioConverter.pcm16kToMulaw8k(pcm);
    expect(mulaw).toHaveLength(2);
    expect(mulaw[0]).toBe(0xff);
  });

  it("converts generated internal mu-law audio back to raw PCM16/8k", () => {
    const pcm = AudioConverter.mulaw8kToPcm8k(Buffer.from([0xff, 0xce]));
    expect(pcm).toHaveLength(4);
    expect(pcm.readInt16LE(0)).toBe(0);
  });

  it("rejects malformed PCM16 frames", () => {
    expect(() => AudioConverter.pcm16kToMulaw8k(Buffer.from([1]))).toThrow("PCM16/8k");
  });
});
