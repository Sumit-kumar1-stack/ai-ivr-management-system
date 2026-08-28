import { Buffer } from "buffer";

/** A latency metric is valid only after non-empty provider audio was accepted. */
export function shouldRecordPremiumFirstAudioSent(input: {
  firstAssistantAudioSentAt: number | null;
  providerAudio: Buffer;
  providerAccepted: boolean;
}): boolean {
  return input.firstAssistantAudioSentAt === null && input.providerAccepted && Buffer.isBuffer(input.providerAudio) && input.providerAudio.length > 0;
}
