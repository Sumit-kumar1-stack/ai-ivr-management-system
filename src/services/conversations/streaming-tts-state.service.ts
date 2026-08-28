import {
  VoiceResponsePolicy,
} from "./voice-response-policy.service";

export type StreamingTtsStatus =
  | "OPEN"
  | "BLOCKED"
  | "COMPLETED";

export interface StreamingTtsAttemptResult {
  attempted: boolean;
  queued: boolean;
  reason:
    | "queued"
    | "empty_phrase"
    | "first_phrase_too_long"
    | "response_budget_exceeded"
    | "queue_failed"
    | "streaming_blocked";
}

export interface StreamingTtsSnapshot {
  status: StreamingTtsStatus;
  attemptedPhrases: string[];
  queuedPhrases: string[];
  failedPhrases: string[];
  finalRemainingSpeech: string;
}

function normalizeSpeech(
  text: string
): string {
  return text
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(
  text: string
): number {
  return normalizeSpeech(text)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

/** Removes only the exact, successfully queued prefix from the policy-bounded
 * final response. A mismatch fails safe by retaining the complete response. */
export function getRemainingStreamingSpeech(
  finalReply: string,
  queuedPhrases: readonly string[]
): string {
  let remaining =
    normalizeSpeech(finalReply);

  for (const phrase of queuedPhrases) {
    const normalizedPhrase =
      normalizeSpeech(phrase);

    if (
      !normalizedPhrase ||
      !remaining.startsWith(
        normalizedPhrase
      )
    ) {
      return normalizeSpeech(
        finalReply
      );
    }

    const boundary =
      remaining[
        normalizedPhrase.length
      ];

    if (
      boundary &&
      !/\s/.test(boundary)
    ) {
      return normalizeSpeech(
        finalReply
      );
    }

    remaining =
      remaining
        .slice(
          normalizedPhrase.length
        )
        .trim();
  }

  return remaining;
}

/** Owns one turn's streaming-TTS decisions. Attempts are serialized by the
 * caller; after a rejection or synthesis failure, later phrases stay in the
 * final response so playback order cannot jump ahead. */
export class StreamingTtsState {
  private status:
    StreamingTtsStatus =
    "OPEN";

  private readonly attemptedPhrases:
    string[] = [];

  private readonly queuedPhrases:
    string[] = [];

  private readonly failedPhrases:
    string[] = [];

  private finalRemainingSpeech =
    "";

  constructor(
    private readonly firstPhraseMaxWords: number
  ) {}

  async attemptPhrase(
    phrase: string,
    queue: (
      phrase: string
    ) => Promise<boolean>,
    options: {
      firstPhrase: boolean;
    }
  ): Promise<StreamingTtsAttemptResult> {
    const normalizedPhrase =
      normalizeSpeech(phrase);

    if (!normalizedPhrase) {
      return {
        attempted: false,
        queued: false,
        reason: "empty_phrase",
      };
    }

    if (this.status !== "OPEN") {
      return {
        attempted: false,
        queued: false,
        reason: "streaming_blocked",
      };
    }

    if (
      options.firstPhrase &&
      countWords(normalizedPhrase) >
        this.firstPhraseMaxWords
    ) {
      this.status = "BLOCKED";

      return {
        attempted: false,
        queued: false,
        reason: "first_phrase_too_long",
      };
    }

    const candidate =
      normalizeSpeech(
        [
          ...this.queuedPhrases,
          normalizedPhrase,
        ].join(" ")
      );

    if (
      VoiceResponsePolicy.apply(
        candidate
      ) !== candidate
    ) {
      this.status = "BLOCKED";

      return {
        attempted: false,
        queued: false,
        reason: "response_budget_exceeded",
      };
    }

    this.attemptedPhrases.push(
      normalizedPhrase
    );

    let queued = false;

    try {
      queued =
        await queue(
          normalizedPhrase
        );
    } catch {
      queued = false;
    }

    if (queued) {
      this.queuedPhrases.push(
        normalizedPhrase
      );

      return {
        attempted: true,
        queued: true,
        reason: "queued",
      };
    }

    this.failedPhrases.push(
      normalizedPhrase
    );
    this.status = "BLOCKED";

    return {
      attempted: true,
      queued: false,
      reason: "queue_failed",
    };
  }

  complete(
    finalReply: string
  ): StreamingTtsSnapshot {
    this.finalRemainingSpeech =
      getRemainingStreamingSpeech(
        finalReply,
        this.queuedPhrases
      );
    this.status = "COMPLETED";

    return this.snapshot();
  }

  snapshot(): StreamingTtsSnapshot {
    return {
      status: this.status,
      attemptedPhrases:
        [...this.attemptedPhrases],
      queuedPhrases:
        [...this.queuedPhrases],
      failedPhrases:
        [...this.failedPhrases],
      finalRemainingSpeech:
        this.finalRemainingSpeech,
    };
  }
}
