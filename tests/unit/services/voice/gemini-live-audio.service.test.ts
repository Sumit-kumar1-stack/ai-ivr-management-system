import { describe, expect, it } from "vitest";
import { normalizeGeminiLiveAudio } from "@/services/voice/gemini-live-audio.service";
import { AudioConverter } from "@/services/voice/audio-converter.service";

describe("Gemini Live output audio normalization", () => {
  const audio = Buffer.from([1, 2, 3, 4, 5, 6]);

  it.each([
    ["Buffer", audio],
    ["Uint8Array", new Uint8Array(audio)],
    ["ArrayBuffer", audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength)],
  ])("accepts %s payloads", (_name, input) => {
    const normalized = normalizeGeminiLiveAudio(input, "audio/pcm;rate=24000");
    expect(normalized.audio).toEqual(audio);
    expect(normalized.byteLength).toBe(audio.length);
    expect(normalized.sampleRate).toBe(24_000);
  });

  it("accepts Gemini's documented inline base64 data", () => {
    const normalized = normalizeGeminiLiveAudio({ inlineData: { data: audio.toString("base64"), mimeType: "audio/pcm;rate=24000" } });
    expect(normalized.inputType).toBe("inlineData");
    expect(normalized.audio).toEqual(audio);
  });

  it("rejects empty payloads without fabricating playable bytes", () => {
    const normalized = normalizeGeminiLiveAudio(Buffer.alloc(0), "audio/pcm;rate=24000");
    expect(normalized.audio).toHaveLength(0);
  });

  it("converts complete PCM16/24k frames into non-empty mu-law/8k audio", () => {
    const pcm = Buffer.alloc(12);
    for (let index = 0; index < 6; index += 1) pcm.writeInt16LE((index + 1) * 1_000, index * 2);
    const mulaw = AudioConverter.pcm24kToMulaw8k(pcm);
    expect(mulaw.length).toBe(2);
    expect(mulaw.some(value => value !== 0)).toBe(true);
  });
});
