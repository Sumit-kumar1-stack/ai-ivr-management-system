import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  StreamingTtsState,
} from "@/services/conversations/streaming-tts-state.service";
import {
  VoiceResponsePolicy,
} from "@/services/conversations/voice-response-policy.service";

describe("streaming TTS state", () => {
  it("keeps a failed second phrase in final speech after the first succeeds", async () => {
    const state =
      new StreamingTtsState(24);

    await state.attemptPhrase(
      "The first phrase is ready.",
      async () => true,
      { firstPhrase: true }
    );
    await state.attemptPhrase(
      "The second phrase failed.",
      async () => false,
      { firstPhrase: false }
    );

    expect(
      state.complete(
        "The first phrase is ready. The second phrase failed."
      )
    ).toMatchObject({
      queuedPhrases: [
        "The first phrase is ready.",
      ],
      failedPhrases: [
        "The second phrase failed.",
      ],
      finalRemainingSpeech:
        "The second phrase failed.",
    });
  });

  it("does not let a later successful queue jump ahead after the first failure", async () => {
    const state =
      new StreamingTtsState(24);
    const laterQueue =
      vi.fn(async () => true);

    await state.attemptPhrase(
      "The first phrase failed.",
      async () => false,
      { firstPhrase: true }
    );
    const later =
      await state.attemptPhrase(
        "The later phrase could queue.",
        laterQueue,
        { firstPhrase: false }
      );

    expect(later).toMatchObject({
      attempted: false,
      queued: false,
      reason: "streaming_blocked",
    });
    expect(laterQueue)
      .not.toHaveBeenCalled();
    expect(
      state.complete(
        "The first phrase failed. The later phrase could queue."
      ).finalRemainingSpeech
    ).toBe(
      "The first phrase failed. The later phrase could queue."
    );
  });

  it("blocks later phrases when an oversized first phrase is rejected", async () => {
    const state =
      new StreamingTtsState(4);
    const queue =
      vi.fn(async () => true);

    const first =
      await state.attemptPhrase(
        "This phrase has too many words.",
        queue,
        { firstPhrase: true }
      );
    const second =
      await state.attemptPhrase(
        "Short phrase.",
        queue,
        { firstPhrase: false }
      );

    expect(first.reason)
      .toBe("first_phrase_too_long");
    expect(second.reason)
      .toBe("streaming_blocked");
    expect(queue)
      .not.toHaveBeenCalled();
  });

  it("removes each successfully queued phrase exactly once", async () => {
    const state =
      new StreamingTtsState(24);

    await state.attemptPhrase(
      "Please listen",
      async () => true,
      { firstPhrase: true }
    );
    await state.attemptPhrase(
      "Please listen",
      async () => true,
      { firstPhrase: false }
    );

    expect(
      state.complete(
        "Please listen Please listen to the remaining details."
      ).finalRemainingSpeech
    ).toBe(
      "to the remaining details."
    );
  });

  it("preserves attempted playback ordering", async () => {
    const state =
      new StreamingTtsState(24);
    const order: string[] = [];

    for (const [index, phrase] of [
      "First phrase.",
      "Second phrase.",
    ].entries()) {
      await state.attemptPhrase(
        phrase,
        async text => {
          order.push(text);
          return true;
        },
        { firstPhrase: index === 0 }
      );
    }

    expect(order).toEqual([
      "First phrase.",
      "Second phrase.",
    ]);
  });

  it("enforces the word budget before another TTS request", async () => {
    const state =
      new StreamingTtsState(24);
    const queue =
      vi.fn(async () => true);
    const first =
      Array.from(
        { length: 20 },
        (_, index) => `first${index}`
      ).join(" ");
    const second =
      Array.from(
        { length: 20 },
        (_, index) => `second${index}`
      ).join(" ");

    await state.attemptPhrase(
      first,
      queue,
      { firstPhrase: true }
    );
    const result =
      await state.attemptPhrase(
        second,
        queue,
        { firstPhrase: false }
      );

    expect(result.reason)
      .toBe("response_budget_exceeded");
    expect(queue)
      .toHaveBeenCalledTimes(1);

    const bounded =
      VoiceResponsePolicy.apply(
        `${first} ${second}`
      );
    const summary =
      state.complete(bounded);

    expect(
      summary.queuedPhrases.join(" ")
        .split(/\s+/)
    ).toHaveLength(20);
    expect(
      summary.finalRemainingSpeech
        .split(/\s+/)
    ).toHaveLength(
      VoiceResponsePolicy.maxWords - 20
    );
  });

  it("enforces the sentence budget during streaming", async () => {
    const state =
      new StreamingTtsState(24);
    const queue =
      vi.fn(async () => true);

    await state.attemptPhrase(
      "First answer sentence.",
      queue,
      { firstPhrase: true }
    );
    await state.attemptPhrase(
      "Second answer sentence.",
      queue,
      { firstPhrase: false }
    );
    const third =
      await state.attemptPhrase(
        "Third answer sentence.",
        queue,
        { firstPhrase: false }
      );

    expect(third.reason)
      .toBe("response_budget_exceeded");
    expect(queue)
      .toHaveBeenCalledTimes(
        VoiceResponsePolicy.maxSentences
      );
  });

  it("combines streamed and final speech without duplication", async () => {
    const state =
      new StreamingTtsState(24);
    const first =
      "Here is the important answer.";
    const second =
      "This is the remaining detail.";

    await state.attemptPhrase(
      first,
      async () => true,
      { firstPhrase: true }
    );

    const finalReply =
      VoiceResponsePolicy.apply(
        `${first} ${second}`
      );
    const summary =
      state.complete(finalReply);

    expect(
      `${summary.queuedPhrases.join(" ")} ${summary.finalRemainingSpeech}`
        .trim()
    ).toBe(finalReply);
  });
});
