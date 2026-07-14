import { AudioChunk } from "@/services/voice/types";

import { playAudio } from "./playback.service";

import {
  PlaybackState,
} from "@/services/voice/playback-state.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

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
  // Stream audio
  //------------------------------------------------

  console.log(
    `📞 Streaming Audio -> ${callId}`
  );

  try {

    await playAudio(
      callId,
      chunk
    );

  } catch (error) {

    console.error(
      "Streaming Error:",
      error
    );

  }

}