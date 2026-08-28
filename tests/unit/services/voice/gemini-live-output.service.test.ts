import { describe, expect, it } from "vitest";
import { shouldRecordPremiumFirstAudioSent } from "@/services/voice/gemini-live-output.service";

describe("premium first-audio metric", () => {
  it("does not report success when provider delivery fails or no audio exists", () => {
    expect(shouldRecordPremiumFirstAudioSent({ firstAssistantAudioSentAt: null, providerAudio: Buffer.from([1]), providerAccepted: false })).toBe(false);
    expect(shouldRecordPremiumFirstAudioSent({ firstAssistantAudioSentAt: null, providerAudio: Buffer.alloc(0), providerAccepted: true })).toBe(false);
  });

  it("reports success only for the first non-empty provider-accepted frame", () => {
    expect(shouldRecordPremiumFirstAudioSent({ firstAssistantAudioSentAt: null, providerAudio: Buffer.from([1]), providerAccepted: true })).toBe(true);
    expect(shouldRecordPremiumFirstAudioSent({ firstAssistantAudioSentAt: 1, providerAudio: Buffer.from([1]), providerAccepted: true })).toBe(false);
  });
});
