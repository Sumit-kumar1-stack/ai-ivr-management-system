import {
  createCallLogger,
} from "@/lib/logger";

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
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

/**
 * Prevent multiple workers
 * running for the same call.
 */
const runningWorkers = new Set<string>();

export class VoiceWorker {

  //------------------------------------------------
  // Convert Text → Audio → Queue
  //------------------------------------------------

  static async addText(
    callId: string,
    text: string
  ) {

    const log =
      createCallLogger(callId);

    if (!text.trim()) {
      return;
    }

    try {

      const audio =
        await VoiceService.synthesize(
          callId,
          text
        );

      voiceQueue.enqueue(
        callId,
        audio
      );

      log.debug(
        {
          queueSize:
            voiceQueue.size(callId),
        },
        "Audio added to queue"
      );

    } catch (error) {

      log.error(
        { error },
        "Failed to synthesize speech"
      );

    }

  }

  //------------------------------------------------
  // Interrupt Current Playback
  //------------------------------------------------

  static interrupt(
    callId: string
  ) {

    const log =
      createCallLogger(callId);

    log.warn(
      "Playback interrupted"
    );

    voiceQueue.clear(callId);

    PlaybackState.stop(callId);

    ConversationStateService.setState(
      callId,
      "INTERRUPTED"
    );

  }

  //------------------------------------------------
  // Stop Worker
  //------------------------------------------------

  static stop(
    callId: string
  ) {

    const log =
      createCallLogger(callId);

    log.info(
      "Stopping voice worker"
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

    const log =
      createCallLogger(callId);

    //--------------------------------------------
    // Prevent Duplicate Workers
    //--------------------------------------------

    if (runningWorkers.has(callId)) {

      log.debug(
        "Voice worker already running"
      );

      return;

    }

    runningWorkers.add(callId);

    log.info(
      "Voice worker started"
    );

    while (true) {

      //----------------------------------------
      // Current Conversation State
      //----------------------------------------

      const state =
        ConversationStateService.getState(
          callId
        );

      //----------------------------------------
      // Conversation Ended
      //----------------------------------------

      if (state === "ENDED") {

        PlaybackState.stop(callId);

        voiceQueue.clear(callId);

        runningWorkers.delete(callId);

        log.info(
          "Voice worker stopped"
        );

        return;

      }

      //----------------------------------------
      // Interrupted
      //----------------------------------------

      if (state === "INTERRUPTED") {

        PlaybackState.stop(callId);

        voiceQueue.clear(callId);

        ConversationStateService.setState(
          callId,
          "LISTENING"
        );

        log.warn(
          "Playback interrupted, returning to LISTENING"
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
      // Next Audio
      //----------------------------------------

      const audio =
        voiceQueue.dequeue(callId);

      if (!audio) {

        await sleep(10);

        continue;

      }

      //----------------------------------------
      // Start Playback
      //----------------------------------------

      PlaybackState.start(callId);

      ConversationStateService.setState(
        callId,
        "SPEAKING"
      );

      log.info(
        {
          queueRemaining:
            voiceQueue.size(callId),
        },
        "Streaming audio to caller"
      );

      try {

        await streamToCall(
          callId,
          audio
        );

      } catch (error) {

        log.error(
          { error },
          "Audio playback failed"
        );

      } finally {

        PlaybackState.stop(callId);

      }

      //----------------------------------------
      // Back To Listening
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