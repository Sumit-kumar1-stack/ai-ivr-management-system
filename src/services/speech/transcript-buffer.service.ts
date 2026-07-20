import {
  TranscriptEvents,
  TranscriptEvent,
} from "./transcript.events";

import {
  PlaybackState,
} from "@/services/voice/playback-state.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

class TranscriptBufferService {

  private buffers =
    new Map<string, string>();

  //----------------------------------
  // Add Partial Transcript
  //----------------------------------

  async addPartial(
    callId: string,
    text: string
  ) {

    const normalizedText =
      text.trim();

    if (!normalizedText) {

      return;

    }

    const current =
      this.buffers.get(callId) ?? "";

    const updated =
      current + normalizedText;

    this.buffers.set(
      callId,
      updated
    );

    console.log(
      `📝 Partial Updated (${callId})`
    );

    console.log(updated);

    //----------------------------------
    // Emit Partial Event
    //----------------------------------

    TranscriptEvents.emit(
      TranscriptEvent.PARTIAL,
      {
        callId,
        text: updated,
        isFinal: false,
        timestamp: Date.now(),
      }
    );

    //----------------------------------
    // Instant Barge-In Detection
    //----------------------------------

    if (
      PlaybackState.isPlaying(callId) &&
      ConversationStateService.getState(callId) !==
        "INTERRUPTING"
    ) {

      console.log(
        `🛑 Barge-In detected (${callId})`
      );

      await VoiceWorker.interrupt(
        callId
      );

    }

  }

  //----------------------------------
  // Replace Current Partial
  //----------------------------------

  async setPartial(
    callId: string,
    text: string
  ) {

    const normalizedText =
      text.trim();

    if (!normalizedText) {

      return;

    }

    this.buffers.set(
      callId,
      normalizedText
    );

    console.log(
      `📝 Partial Replaced (${callId})`
    );

    console.log(normalizedText);

    //----------------------------------
    // Emit Partial Event
    //----------------------------------

    TranscriptEvents.emit(
      TranscriptEvent.PARTIAL,
      {
        callId,
        text: normalizedText,
        isFinal: false,
        timestamp: Date.now(),
      }
    );

    //----------------------------------
    // Instant Barge-In Detection
    //----------------------------------

    if (
      PlaybackState.isPlaying(callId) &&
      ConversationStateService.getState(callId) !==
        "INTERRUPTING"
    ) {

      console.log(
        `🛑 Barge-In detected (${callId})`
      );

      await VoiceWorker.interrupt(
        callId
      );

    }

  }

  //----------------------------------
  // Flush Final Transcript
  //----------------------------------

  flush(
    callId: string
  ) {

    const text =
      this.buffers.get(callId);

    if (!text) {

      console.log(
        "⚠️ No transcript to flush"
      );

      return;

    }

    this.buffers.delete(
      callId
    );

    console.log(
      "=================================="
    );

    console.log(
      "🛑 FLUSHING FINAL TRANSCRIPT"
    );

    console.log(callId);

    console.log(text);

    console.log(
      "🔥 EMITTING FINAL EVENT"
    );

    console.log(
      "=================================="
    );

    TranscriptEvents.emit(
      TranscriptEvent.FINAL,
      {
        callId,
        text,
        timestamp: Date.now(),
      }
    );

  }

}

export const TranscriptBuffer =
  new TranscriptBufferService();