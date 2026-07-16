import { AudioChunk } from "@/services/voice/types";

import {
  PlaybackState,
} from "@/services/voice/playback-state.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  AudioConverter,
} from "@/services/voice/audio-converter.service";

import {
  streamAudioToTwilio,
} from "./twilio-stream.service";

export async function streamToCall(
  callId: string,
  chunk: AudioChunk
) {

  //------------------------------------------------
  // Conversation stopped?
  //------------------------------------------------

  const state =
    ConversationStateService.getState(callId);

  if (
    state === "INTERRUPTED" ||
    state === "ENDED"
  ) {

    console.log(
      `⛔ Stream cancelled (${state})`
    );

    return;

  }

  //------------------------------------------------
  // Playback cancelled?
  //------------------------------------------------

  if (
    !PlaybackState.isSpeaking(callId)
  ) {

    console.log(
      "⛔ Playback interrupted"
    );

    return;

  }

  //------------------------------------------------
  // Convert audio for Twilio
  //------------------------------------------------

  try {

    const audio =
      await AudioConverter.textToMulaw(
        chunk.text
      );

    console.log(
      `📞 Streaming Audio -> ${callId}`
    );

    await streamAudioToTwilio(
      callId,
      audio
    );

  } catch (error) {

    console.error(
      "Streaming Error:",
      error
    );

  }

}