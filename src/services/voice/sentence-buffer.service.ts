import { STANDARD_REALTIME_CONFIG } from "@/config/standard-realtime";
import { createCallLogger } from "@/lib/logger";

type SentenceCallback = (sentence: string) => Promise<void>;

const sentenceBoundary = /[.!?]+(?:\s|$)/g;
const clauseBoundary = /[,;:\u0964](?:\s|$)/g;

function trimStart(text: string): string {
  return text.replace(/^\s+/, "");
}

function lastBoundaryBefore(text: string, expression: RegExp, maximum: number): number | null {
  expression.lastIndex = 0;
  let result: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    const end = match.index + match[0].length;
    if (end > maximum) break;
    result = end;
  }
  return result;
}

/**
 * Holds short fragments until a meaningful safe boundary. Only a final
 * residual may be below the configured minimum phrase length.
 */
function nextPhrase(source: string, final: boolean): { phrase: string; consumed: number } | null {
  const text = trimStart(source);
  const leadingWhitespace = source.length - text.length;
  if (!text) return null;
  const min = STANDARD_REALTIME_CONFIG.ttsMinPhraseChars;
  const max = STANDARD_REALTIME_CONFIG.ttsMaxPhraseChars;

  sentenceBoundary.lastIndex = 0;
  let sentence: RegExpExecArray | null;
  while ((sentence = sentenceBoundary.exec(text)) !== null) {
    const end = sentence.index + sentence[0].length;
    if (end > max) break;
    if (text.slice(0, end).trim().length >= min) {
      return { phrase: text.slice(0, end).trim(), consumed: leadingWhitespace + end };
    }
  }

  if (text.length > max) {
    const splitAt =
      lastBoundaryBefore(text, sentenceBoundary, max) ??
      lastBoundaryBefore(text, clauseBoundary, max) ??
      (text.lastIndexOf(" ", max) || max);
    return { phrase: text.slice(0, splitAt).trim(), consumed: leadingWhitespace + splitAt };
  }

  if (text.trim().length >= min && /\s$/.test(text)) {
    return { phrase: text.trim(), consumed: source.length };
  }

  if (final) {
    return { phrase: text.trim(), consumed: source.length };
  }

  return null;
}

/** Pure deterministic helper for phrase-policy tests and offline benchmark. */
export function splitStandardPhrases(text: string, final = true): string[] {
  const phrases: string[] = [];
  let remaining = text;
  while (remaining.trim()) {
    const next = nextPhrase(remaining, final);
    if (!next || !next.phrase) break;
    phrases.push(next.phrase);
    remaining = remaining.slice(next.consumed);
  }
  return phrases;
}

class SentenceBuffer {
  private buffers = new Map<string, string>();

  append(callId: string, chunk: string): void {
    this.buffers.set(callId, (this.buffers.get(callId) ?? "") + chunk);
  }

  async flushCompleteSentences(callId: string, callback: SentenceCallback): Promise<void> {
    let remaining = this.buffers.get(callId) ?? "";
    while (remaining.trim()) {
      const next = nextPhrase(remaining, false);
      if (!next || !next.phrase) break;
      await callback(next.phrase);
      remaining = remaining.slice(next.consumed);
    }
    this.buffers.set(callId, remaining);
  }

  async flushRemaining(callId: string, callback: SentenceCallback): Promise<void> {
    let remaining = this.buffers.get(callId) ?? "";
    while (remaining.trim()) {
      const next = nextPhrase(remaining, true);
      if (!next || !next.phrase) break;
      await callback(next.phrase);
      remaining = remaining.slice(next.consumed);
    }
    this.buffers.delete(callId);
  }

  clear(callId: string): void {
    const buffer = this.buffers.get(callId);
    this.buffers.delete(callId);
    createCallLogger(callId).debug({ event: "voice.sentence_buffer.cleared", bufferedCharacterCount: buffer?.length ?? 0 }, "Sentence buffer cleared");
  }
}

export const sentenceBuffer = new SentenceBuffer();
