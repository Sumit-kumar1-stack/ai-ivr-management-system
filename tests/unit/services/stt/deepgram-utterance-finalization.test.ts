import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  markSttFinal: vi.fn(),
  markSttPartial: vi.fn(),
  markSttStablePartial: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createCallLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  createServerLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  normalizeError: vi.fn(() => ({
    name: "Error",
    message: "redacted",
  })),
}));

vi.mock("@/services/conversations/conversation-state.service", () => ({
  ConversationStateService: {
    getState: vi.fn(() => "LISTENING"),
  },
}));

vi.mock("@/services/voice/playback-state.service", () => ({
  PlaybackState: {
    isPlaying: vi.fn(() => false),
  },
}));

vi.mock("@/services/voice/voice-worker.service", () => ({
  VoiceWorker: {
    interrupt: vi.fn(),
  },
}));

vi.mock("@/services/voice-runtime/turn-coordinator.service", () => ({
  TurnCoordinator: {
    interrupt: vi.fn(),
  },
}));

vi.mock("@/services/voice-runtime/cascaded-turn-latency.service", () => ({
  CascadedTurnLatency: {
    markSttFinal: mocks.markSttFinal,
    markSttPartial: mocks.markSttPartial,
    markSttStablePartial:
      mocks.markSttStablePartial,
  },
}));

vi.mock("@/services/voice-runtime/standard-partial-prefetch.service", () => ({
  StandardPartialPrefetch: {
    observePartial: vi.fn(),
  },
}));

import {
  DeepgramEvents,
} from "@/services/stt/deepgram.events";
import {
  TranscriptBuffer,
} from "@/services/speech/transcript-buffer.service";
import {
  TranscriptEvent,
  TranscriptEvents,
} from "@/services/speech/transcript.events";

describe("Deepgram utterance finalization", () => {
  const callId =
    "deepgram-call";
  let finalTurns: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    TranscriptBuffer.clear(callId);
    TranscriptEvents.removeAllListeners();
    finalTurns = [];
    TranscriptEvents.on(
      TranscriptEvent.FINAL,
      event => {
        finalTurns.push(
          event.text
        );
      }
    );
  });

  it("updates an interim partial without flushing", async () => {
    await DeepgramEvents.handle(callId, {
      type: "Results",
      is_final: false,
      channel: {
        alternatives: [{
          transcript:
            "I want to know",
        }],
      },
    });

    expect(TranscriptBuffer.get(callId))
      .toBe("I want to know");
    expect(finalTurns).toEqual([]);
    expect(mocks.markSttFinal)
      .not.toHaveBeenCalled();
  });

  it("commits is_final segments without flushing and accumulates them", async () => {
    await DeepgramEvents.handle(callId, {
      type: "Results",
      is_final: true,
      channel: {
        alternatives: [{
          transcript:
            "I want to know",
        }],
      },
    });
    await DeepgramEvents.handle(callId, {
      type: "Results",
      is_final: true,
      channel: {
        alternatives: [{
          transcript:
            "about personal loan interest rates",
        }],
      },
    });

    expect(TranscriptBuffer.get(callId))
      .toBe("I want to know about personal loan interest rates");
    expect(finalTurns).toEqual([]);
    expect(mocks.markSttFinal)
      .not.toHaveBeenCalled();
  });

  it("speech_final flushes the complete accumulated utterance once", async () => {
    await DeepgramEvents.handle(callId, {
      type: "Results",
      is_final: true,
      channel: {
        alternatives: [{
          transcript:
            "I want to know",
        }],
      },
    });
    await DeepgramEvents.handle(callId, {
      type: "Results",
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [{
          transcript:
            "about personal loan interest rates",
        }],
      },
    });

    expect(finalTurns).toEqual([
      "I want to know about personal loan interest rates",
    ]);
    expect(TranscriptBuffer.get(callId))
      .toBe("");
    expect(mocks.markSttFinal)
      .toHaveBeenCalledTimes(1);
  });

  it("UtteranceEnd flushes committed segments once", async () => {
    await DeepgramEvents.handle(callId, {
      type: "Results",
      is_final: true,
      channel: {
        alternatives: [{
          transcript:
            "Please explain the rate",
        }],
      },
    });
    await DeepgramEvents.handle(callId, {
      type: "UtteranceEnd",
    });

    expect(finalTurns).toEqual([
      "Please explain the rate",
    ]);
    expect(mocks.markSttFinal)
      .toHaveBeenCalledTimes(1);
  });

  it("does not duplicate a turn when terminal events repeat", async () => {
    await DeepgramEvents.handle(callId, {
      type: "Results",
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [{
          transcript:
            "Tell me more",
        }],
      },
    });
    await DeepgramEvents.handle(callId, {
      type: "UtteranceEnd",
    });
    await DeepgramEvents.handle(callId, {
      type: "UtteranceEnd",
    });

    expect(finalTurns).toEqual([
      "Tell me more",
    ]);
    expect(mocks.markSttFinal)
      .toHaveBeenCalledTimes(1);
  });
});
