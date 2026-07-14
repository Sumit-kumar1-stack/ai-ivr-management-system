import { VoiceService } from "./voice.service";
import { voiceQueue } from "./voice-queue.service";

import {
  PlaybackState,
} from "./playback-state.service";

import {
  streamToCall,
} from "@/providers/telephony/stream.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const runningWorkers = new Set<string>();

export class VoiceWorker {

  //------------------------------------------------
  // Convert text -> audio -> queue
  //------------------------------------------------

  static async addText(
    callId: string,
    text: string
  ) {

    if (!text.trim()) {
      return;
    }

    const audio =
      await VoiceService.synthesize(
        callId,
        text
      );

    voiceQueue.enqueue(
      callId,
      audio
    );

  }

  //------------------------------------------------
  // Interrupt playback
  //------------------------------------------------

  static interrupt(
    callId: string
  ) {

    console.log(
      `🛑 Interrupt (${callId})`
    );

    voiceQueue.clear(callId);

    PlaybackState.stop(callId);

    ConversationStateService.setState(
      callId,
      "INTERRUPTED"
    );

  }

  //------------------------------------------------
  // End worker
  //------------------------------------------------

  static stop(
    callId: string
  ) {

    console.log(
      `🛑 Stop Worker (${callId})`
    );

    voiceQueue.clear(callId);

    PlaybackState.stop(callId);

    ConversationStateService.setState(
      callId,
      "ENDED"
    );

  }

  //------------------------------------------------
  // Playback Worker
  //------------------------------------------------

  static async start(
    callId: string
  ) {

    if (
      runningWorkers.has(callId)
    ) {
      return;
    }

    runningWorkers.add(callId);

    console.log(
      `🎙 Voice Worker Started (${callId})`
    );

    while (true) {

      //----------------------------------------
      // End Conversation
      //----------------------------------------

      const state =
        ConversationStateService.getState(
          callId
        );

      if (
        state === "ENDED"
      ) {

        console.log(
          `🛑 Voice Worker Ended (${callId})`
        );

        PlaybackState.stop(callId);

        voiceQueue.clear(callId);

        runningWorkers.delete(callId);

        return;

      }

      //----------------------------------------
      // Interrupted
      //----------------------------------------

      if (
        state === "INTERRUPTED"
      ) {

        console.log(
          `⚠️ Playback Interrupted (${callId})`
        );

        PlaybackState.stop(callId);

        voiceQueue.clear(callId);

        ConversationStateService.setState(
          callId,
          "LISTENING"
        );

        await sleep(20);

        continue;

      }

      //----------------------------------------
      // Queue Empty
      //----------------------------------------

      if (
        !voiceQueue.hasItems(callId)
      ) {

        await sleep(30);

        continue;

      }

      //----------------------------------------
      // Get Next Audio
      //----------------------------------------

      const audio =
        voiceQueue.dequeue(callId);

      if (!audio) {

        await sleep(10);

        continue;

      }

      //----------------------------------------
      // Speaking
      //----------------------------------------

      PlaybackState.start(callId);

      ConversationStateService.setState(
        callId,
        "SPEAKING"
      );

      try {

        await streamToCall(
          callId,
          audio
        );

      } catch (error) {

        console.error(
          "Playback Error:",
          error
        );

      }

      PlaybackState.stop(callId);

      //----------------------------------------
      // Back to Listening
      //----------------------------------------

      if (
        ConversationStateService.getState(callId) ===
        "SPEAKING"
      ) {

        ConversationStateService.setState(
          callId,
          "LISTENING"
        );

      }

    }

  }

}