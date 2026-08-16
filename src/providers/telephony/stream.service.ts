import {
  createCallLogger,
} from "@/lib/logger";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  PlaybackState,
} from "@/services/voice/playback-state.service";

import {
  TTSAudioChunk,
} from "@/services/voice/types";

import {
  AudioSessionService,
} from "./audio-session.service";

import {
  streamAudioToTwilio,
} from "./twilio-stream.service";

//--------------------------------------------------
// Stream Audio To Active Call
//--------------------------------------------------

export async function streamToCall(
  callId: string,
  chunk: TTSAudioChunk
): Promise<void> {
  const normalizedCallId =
    callId.trim();

  //--------------------------------------------
  // Validate Call ID
  //--------------------------------------------

  if (
    !normalizedCallId
  ) {
    throw new Error(
      "Cannot stream audio without callId"
    );
  }

  const log =
    createCallLogger(
      normalizedCallId
    );

  //--------------------------------------------
  // Validate Active Session
  //--------------------------------------------

  if (
    !AudioSessionService.getByCallId(
      normalizedCallId
    )
  ) {
    log.debug(
      {
        event:
          "telephony.stream.skipped",

        reason:
          "call_session_not_found",
      },
      "Call audio stream skipped"
    );

    return;
  }

  //--------------------------------------------
  // Conversation Stopped?
  //--------------------------------------------

  const state =
    ConversationStateService.getState(
      normalizedCallId
    );

  if (
    state ===
      "INTERRUPTING" ||
    state ===
      "ENDED"
  ) {
    log.debug(
      {
        event:
          "telephony.stream.skipped",

        reason:
          "conversation_inactive",

        conversationState:
          state,
      },
      "Call audio stream cancelled"
    );

    return;
  }

  //--------------------------------------------
  // Playback Cancelled?
  //--------------------------------------------

  if (
    !PlaybackState.isSpeaking(
      normalizedCallId
    )
  ) {
    log.debug(
      {
        event:
          "telephony.stream.skipped",

        reason:
          "playback_inactive",
      },
      "Call playback is no longer active"
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
      "TTS audio must be a Buffer"
    );
  }

  if (
    chunk.audio.length ===
    0
  ) {
    throw new Error(
      "TTS returned an empty audio buffer"
    );
  }

  //--------------------------------------------
  // Send Through Configured Transport
  //--------------------------------------------

  log.debug(
    {
      event:
        "telephony.stream.preparing",

      audioByteCount:
        chunk.audio.length,
    },
    "Preparing call audio playback"
  );

  await streamAudioToTwilio(
    normalizedCallId,
    chunk.audio
  );
}

//--------------------------------------------------
// Clear Provider Playback Buffer
//--------------------------------------------------

export function clearCallPlayback(
  callId: string
): boolean {
  const normalizedCallId =
    callId.trim();

  if (
    !normalizedCallId
  ) {
    return false;
  }

  return AudioSessionService.clearPlayback(
    normalizedCallId
  );
}

//--------------------------------------------------
// Check Stream Availability
//--------------------------------------------------

export function isCallStreamReady(
  callId: string
): boolean {
  const normalizedCallId =
    callId.trim();

  if (
    !normalizedCallId
  ) {
    return false;
  }

  return AudioSessionService.isReady(
    normalizedCallId
  );
}

//--------------------------------------------------
// Close Active Call Stream
//--------------------------------------------------

export function closeCallStream(
  callId: string
): void {
  const normalizedCallId =
    callId.trim();

  if (
    !normalizedCallId
  ) {
    return;
  }

  AudioSessionService.closeByCallId(
    normalizedCallId
  );
}