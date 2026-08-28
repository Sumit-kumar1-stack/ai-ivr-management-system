import { afterEach, describe, expect, it } from "vitest";
import { StandardPartialPrefetch } from "@/services/voice-runtime/standard-partial-prefetch.service";

describe("StandardPartialPrefetch", () => {
  const callId = "standard-prefetch-call";

  afterEach(() => StandardPartialPrefetch.clear(callId));

  it("only retains a compatible stable partial for a finalized turn", () => {
    StandardPartialPrefetch.observePartial(callId, "I need information about a personal loan");

    expect(StandardPartialPrefetch.consumeFinal(callId, "I need information about a personal loan documents")).toMatchObject({
      intent: "NONE",
    });
  });

  it("discards a prefetch if the caller materially changes meaning", () => {
    StandardPartialPrefetch.observePartial(callId, "I need information about a personal loan");

    expect(StandardPartialPrefetch.consumeFinal(callId, "Please transfer me to an agent")).toBeNull();
  });

  it("does not turn a partial into an action", () => {
    StandardPartialPrefetch.observePartial(callId, "please transfer me to a human representative right now");

    expect(StandardPartialPrefetch.consumeFinal(callId, "please transfer me to a human representative right now")).toMatchObject({
      intent: "NONE",
    });
  });
});
