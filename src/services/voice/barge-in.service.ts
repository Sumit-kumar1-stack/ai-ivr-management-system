import {
  voiceQueue,
} from "./voice-queue.service";

import {
  PlaybackState,
} from "./playback-state.service";

export class BargeInService {

  static interrupt(
    callId: string
  ) {

    if (
      !PlaybackState.isSpeaking(callId)
    ) {

      return false;

    }

    console.log(
      "\n🛑 BARGE-IN DETECTED\n"
    );

    voiceQueue.clear(callId);

    PlaybackState.stop(callId);

    return true;

  }

}