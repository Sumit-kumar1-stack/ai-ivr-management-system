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

import {
  AudioSessionService,
} from "./audio-session.service";


//--------------------------------------------------
// Stream Audio To Active Call
//--------------------------------------------------

export async function streamToCall(
  callId: string,
  chunk: TTSAudioChunk
): Promise<void> {

  //--------------------------------------------
  // Validate Call ID
  //--------------------------------------------

  if (
    !callId.trim()
  ) {

    throw new Error(
      "Cannot stream audio without callId"
    );

  }


  //--------------------------------------------
  // Conversation Stopped?
  //--------------------------------------------

  const state =
    ConversationStateService.getState(
      callId
    );


  if (
    state ===
      "INTERRUPTING" ||
    state ===
      "ENDED"
  ) {

    console.log(
      "Call stream cancelled",
      {
        callId,
        state,
      }
    );


    return;

  }


  //--------------------------------------------
  // Playback Cancelled?
  //--------------------------------------------

  if (
    !PlaybackState.isSpeaking(
      callId
    )
  ) {

    console.log(
      "Call playback is no longer active",
      {
        callId,
      }
    );


    return;

  }


  //--------------------------------------------
  // Validate Generated Audio
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
  // Send Through Configured Transport
  //--------------------------------------------

  console.log(
    "Preparing call audio playback",
    {
      callId,

      bytes:
        chunk.audio.length,
    }
  );


  /*
   * Currently Twilio is the active streaming
   * transport.
   *
   * Future providers can be selected here through
   * a media transport factory.
   */
  await streamAudioToTwilio(
    callId,
    chunk.audio
  );

}


//--------------------------------------------------
// Clear Provider Playback Buffer
//--------------------------------------------------

export function clearCallPlayback(
  callId: string
): boolean {

  if (
    !callId.trim()
  ) {

    return false;

  }


  /*
   * Hide provider-specific session handling from
   * VoiceWorker and conversation services.
   */
  return AudioSessionService.clearPlayback(
    callId
  );

}


//--------------------------------------------------
// Check Stream Availability
//--------------------------------------------------

export function isCallStreamReady(
  callId: string
): boolean {

  if (
    !callId.trim()
  ) {

    return false;

  }


  return AudioSessionService.isReady(
    callId
  );

}


//--------------------------------------------------
// Close Active Call Stream
//--------------------------------------------------

export function closeCallStream(
  callId: string
): void {

  if (
    !callId.trim()
  ) {

    return;

  }


  AudioSessionService.closeByCallId(
    callId
  );

}