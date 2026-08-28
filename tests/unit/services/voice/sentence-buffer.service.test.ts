import { describe, expect, it } from "vitest";
import { STANDARD_REALTIME_CONFIG } from "@/config/standard-realtime";
import { sentenceBuffer, splitStandardPhrases } from "@/services/voice/sentence-buffer.service";

async function stream(callId: string, chunks: string[], final = false): Promise<string[]> {
  const emitted: string[] = [];
  for (const chunk of chunks) {
    sentenceBuffer.append(callId, chunk);
    await sentenceBuffer.flushCompleteSentences(callId, async phrase => { emitted.push(phrase); });
  }
  if (final) await sentenceBuffer.flushRemaining(callId, async phrase => { emitted.push(phrase); });
  return emitted;
}

const normalized = (value: string) => value.replace(/\s+/g, " ").trim();

describe("Standard sentence phrase policy", () => {
  it("holds a tiny fragment", async () => {
    expect(await stream("tiny", ["For "])).toEqual([]);
  });

  it("accumulates repeated tiny fragments instead of sending each token", async () => {
    expect(await stream("repeated", ["For ", "a ", "personal ", "loan, "])).toEqual([]);
  });

  it("holds punctuation below minimum until enough text is available", async () => {
    expect(await stream("short-punctuation", ["Okay. "])).toEqual([]);
  });

  it("flushes a meaningful sentence boundary", async () => {
    const text = "This is a sufficiently meaningful phrase. ";
    expect(await stream("sentence", [text])).toEqual([text.trim()]);
  });

  it("flushes at the minimum threshold on a safe word boundary", async () => {
    const text = "x".repeat(STANDARD_REALTIME_CONFIG.ttsMinPhraseChars) + " ";
    expect(await stream("minimum", [text])).toEqual([text.trim()]);
  });

  it("splits oversized sentences at word boundaries without loss or duplicates", () => {
    const text = `${"loan ".repeat(70).trim()}.`;
    const phrases = splitStandardPhrases(text);
    expect(phrases).toHaveLength(2);
    expect(phrases.every(phrase => phrase.length <= STANDARD_REALTIME_CONFIG.ttsMaxPhraseChars)).toBe(true);
    expect(normalized(phrases.join(" "))).toBe(normalized(text));
  });

  it("splits long unpunctuated text safely", () => {
    const text = "information ".repeat(80).trim();
    const phrases = splitStandardPhrases(text);
    expect(phrases.length).toBeGreaterThan(1);
    expect(normalized(phrases.join(" "))).toBe(normalized(text));
  });

  it("preserves ordering across multiple sentences and duplicate punctuation", () => {
    const text = "This first phrase is meaningful!! This second phrase is also meaningful?";
    const phrases = splitStandardPhrases(text);
    expect(phrases).toEqual(["This first phrase is meaningful!!", "This second phrase is also meaningful?"]);
  });

  it("flushes a short residual only when streaming finishes", async () => {
    expect(await stream("final", ["Thanks"], true)).toEqual(["Thanks"]);
  });

  it("ignores empty residuals", async () => {
    expect(await stream("empty", ["   "], true)).toEqual([]);
  });

  it("handles Unicode and Hindi text without character loss", () => {
    const text = "नमस्ते, आपका व्यक्तिगत ऋण आवेदन स्वीकार कर लिया गया है।";
    const phrases = splitStandardPhrases(text);
    expect(normalized(phrases.join(" "))).toBe(normalized(text));
  });

  it("keeps an exact maximum-sized phrase intact", () => {
    const text = `${"a".repeat(STANDARD_REALTIME_CONFIG.ttsMaxPhraseChars - 1)} `;
    expect(splitStandardPhrases(text)).toEqual([text.trim()]);
  });

  it("does not flush a cancelled generation residual after its buffer is cleared", async () => {
    sentenceBuffer.append("cancelled", "late residual");
    sentenceBuffer.clear("cancelled");
    const output: string[] = [];
    await sentenceBuffer.flushRemaining("cancelled", async phrase => { output.push(phrase); });
    expect(output).toEqual([]);
  });
});
