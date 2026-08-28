import { createCallLogger } from "@/lib/logger";
import { AudioSessionService } from "@/providers/telephony/audio-session.service";
import { GeminiLiveMediaService } from "@/services/voice/gemini-live-media.service";
import { VoiceWorker } from "@/services/voice/voice-worker.service";

/** Stops local AI output before a provider takes ownership of the live call. */
export function prepareHumanTransferContinuity(callId: string): void {
  const normalized = callId.trim();
  if (!normalized) return;
  const playbackCleared = AudioSessionService.clearPlayback(normalized);
  VoiceWorker.stop(normalized);
  GeminiLiveMediaService.close(normalized);
  createCallLogger(normalized).info({ event: "agent.transfer.continuity_prepared", playbackCleared }, "Stopped AI playback before human transfer");
}
