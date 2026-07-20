import {
  TTSAudioChunk,
} from "@/services/voice/types";

import {
  PlaybackState,
} from "@/services/voice/playback-state.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  streamAudioToTwilio,
} from "./twilio-stream.service";

export async function streamToCall(
  callId: string,
  chunk: TTSAudioChunk
): Promise<void> {
  //--------------------------------------------
  // Conversation stopped?
  //--------------------------------------------

  const state =
    ConversationStateService
      .getState(
        callId
      );

  if (
    state ===
      "INTERRUPTING" ||
    state ===
      "ENDED"
  ) {
    console.log(
      `⛔ Stream cancelled (${state})`
    );

    return;
  }

  //--------------------------------------------
  // Playback cancelled?
  //--------------------------------------------

  if (
    !PlaybackState
      .isSpeaking(
        callId
      )
  ) {
    console.log(
      `⛔ Playback interrupted (${callId})`
    );

    return;
  }

  //--------------------------------------------
  // Validate generated audio
  //--------------------------------------------

  if (
    !Buffer.isBuffer(
      chunk.audio
    )
  ) {
    throw new TypeError(
      `TTS audio is not a Buffer for call ${callId}`
    );
  }

  if (
    chunk.audio.length ===
    0
  ) {
    throw new Error(
      `TTS returned empty audio for call ${callId}`
    );
  }

  //--------------------------------------------
  // Send generated telephony-ready audio
  //--------------------------------------------

  console.log(
    `📞 Preparing Twilio playback (${callId})`
  );

  await streamAudioToTwilio(
    callId,
    chunk.audio
  );
}