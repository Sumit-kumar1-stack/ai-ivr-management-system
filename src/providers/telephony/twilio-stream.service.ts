import {
  Buffer,
} from "buffer";

import {
  AudioSessionService,
} from "./audio-session.service";

const SOCKET_TIMEOUT_MS =
  20000;

export async function streamAudioToTwilio(
  callId: string,
  audio: Buffer
): Promise<void> {
  if (!callId) {
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
      `Audio is not a Buffer for call ${callId}`
    );
  }

  if (
    audio.length === 0
  ) {
    throw new Error(
      `Audio buffer is empty for call ${callId}`
    );
  }

  console.log(
    `⏳ Waiting for Twilio stream (${callId})`
  );

  await AudioSessionService
    .waitForCall(
      callId,
      SOCKET_TIMEOUT_MS
    );

  const sent =
    AudioSessionService
      .sendAudioByCallId(
        callId,
        audio
      );

  if (!sent) {
    throw new Error(
      `Failed to send audio to Twilio for call ${callId}`
    );
  }

  console.log(
    `✅ Streaming Audio -> ${callId}`
  );
}