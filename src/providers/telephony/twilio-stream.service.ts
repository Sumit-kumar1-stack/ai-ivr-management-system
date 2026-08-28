import {
  Buffer,
} from "buffer";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  AudioSessionService,
} from "./audio-session.service";

import {
  CascadedTurnLatency,
} from "@/services/voice-runtime/cascaded-turn-latency.service";

const SOCKET_TIMEOUT_MS =
  20_000;

//--------------------------------------------------
// Stream Audio To Twilio
//--------------------------------------------------

export async function streamAudioToTwilio(
  callId: string,
  audio: Buffer
): Promise<void> {
  const normalizedCallId =
    callId.trim();

  //--------------------------------------------
  // Validate Input
  //--------------------------------------------

  if (
    !normalizedCallId
  ) {
    throw new Error(
      "Cannot stream audio without callId"
    );
  }

  if (
    !Buffer.isBuffer(
      audio
    )
  ) {
    throw new TypeError(
      "Audio must be a Buffer"
    );
  }

  if (
    audio.length ===
    0
  ) {
    throw new Error(
      "Audio buffer cannot be empty"
    );
  }

  const log =
    createCallLogger(
      normalizedCallId
    );

  //--------------------------------------------
  // Validate Existing Session
  //--------------------------------------------

  if (
    !AudioSessionService.getByCallId(
      normalizedCallId
    )
  ) {
    log.debug(
      {
        event:
          "twilio.audio_stream.skipped",

        reason:
          "call_session_not_found",

        audioByteCount:
          audio.length,
      },
      "Twilio audio stream skipped"
    );

    return;
  }

  //--------------------------------------------
  // Wait For Ready Media Stream
  //--------------------------------------------

  log.debug(
    {
      event:
        "twilio.audio_stream.waiting",

      timeoutMilliseconds:
        SOCKET_TIMEOUT_MS,

      audioByteCount:
        audio.length,
    },
    "Waiting for Twilio media stream"
  );

  await AudioSessionService.waitForCall(
    normalizedCallId,
    SOCKET_TIMEOUT_MS
  );

  //--------------------------------------------
  // Send Audio
  //--------------------------------------------

  const sent =
    AudioSessionService.sendAudioByCallId(
      normalizedCallId,
      audio
    );

  if (
    !sent
  ) {
    CascadedTurnLatency.fail(
      normalizedCallId,
      "OUTPUT"
    );

    throw new Error(
      "Failed to send audio to Twilio"
    );
  }

  log.debug(
    {
      event:
        "twilio.audio_stream.completed",

      audioByteCount:
        audio.length,
    },
    "Audio streamed to Twilio"
  );
}
