/** Operational controls for the provider-neutral cascaded runtime. */
function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function enabled(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

export const STANDARD_REALTIME_CONFIG = {
  endpointingMs: boundedInteger("STANDARD_STT_ENDPOINTING_MS", 350, 100, 2_000),
  utteranceEndMs: boundedInteger("STANDARD_STT_UTTERANCE_END_MS", 650, 250, 3_000),
  finalMergeMs: boundedInteger("STANDARD_FINAL_MERGE_MS", 100, 0, 1_000),
  punctuationMergeMs: boundedInteger("STANDARD_PUNCTUATION_MERGE_MS", 25, 0, 300),
  stablePartialMinCharacters: boundedInteger("STANDARD_STABLE_PARTIAL_MIN_CHARS", 24, 8, 400),
  bargeInMinCharacters: boundedInteger("STANDARD_BARGE_IN_MIN_CHARS", 4, 2, 80),
  speculativePrefetchEnabled: enabled("STANDARD_SPECULATIVE_PREFETCH_ENABLED", true),
  rerankerTimeoutMs: boundedInteger("STANDARD_RERANK_TIMEOUT_MS", 400, 100, 2_000),
  ttsQueueMaxChunks: boundedInteger("STANDARD_TTS_QUEUE_MAX_CHUNKS", 3, 1, 20),
  firstPhraseMinCharacters: boundedInteger("STANDARD_FIRST_PHRASE_MIN_CHARS", 24, 8, 400),
  ttsMinPhraseChars: boundedInteger("STANDARD_TTS_MIN_PHRASE_CHARS", 24, 8, 400),
  ttsMaxPhraseChars: boundedInteger("STANDARD_TTS_MAX_PHRASE_CHARS", 240, 40, 1_000),
} as const;
