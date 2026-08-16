import {
  createCallLogger,
} from "@/lib/logger";

import {
  PlaybackState,
} from "./playback-state.service";

import {
  voiceQueue,
} from "./voice-queue.service";

//--------------------------------------------------
// Barge-In Service
//--------------------------------------------------

export class BargeInService {
  static interrupt(
    callId: string
  ): boolean {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return false;
    }

    if (
      !PlaybackState.isSpeaking(
        normalizedCallId
      )
    ) {
      return false;
    }

    const log =
      createCallLogger(
        normalizedCallId
      );

    const queuedItemCount =
      voiceQueue.size(
        normalizedCallId
      );

    voiceQueue.clear(
      normalizedCallId
    );

    PlaybackState.stop(
      normalizedCallId
    );

    log.info(
      {
        event:
          "voice.barge_in.detected",

        clearedQueueItemCount:
          queuedItemCount,
      },
      "Caller barge-in detected"
    );

    return true;
  }
}