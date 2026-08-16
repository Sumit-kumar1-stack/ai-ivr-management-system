import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  TranscriptBuffer,
} from "@/services/speech/transcript-buffer.service";

import {
  silenceDetector,
} from "./silence-detector.service";

import {
  liveTranscript,
} from "./live-transcript.service";

//--------------------------------------------------
// Handle Speech Chunk
//--------------------------------------------------

export async function onSpeechChunk(
  callId: string,
  text: string
): Promise<void> {
  const log =
    createCallLogger(
      callId
    );

  const normalizedText =
    text.trim();

  if (
    !normalizedText
  ) {
    return;
  }

  log.debug(
    {
      event:
        "voice.speech.partial_received",

      characterCount:
        normalizedText.length,
    },
    "Partial speech chunk received"
  );

  liveTranscript.append(
    callId,
    normalizedText
  );

  silenceDetector.reset(
    callId,
    async () => {
      const finalText =
        liveTranscript
          .get(
            callId
          )
          .trim();

      if (
        !finalText
      ) {
        log.debug(
          {
            event:
              "voice.speech.silence_ignored",

            reason:
              "empty_transcript",
          },
          "Silence callback ignored"
        );

        return;
      }

      log.info(
        {
          event:
            "voice.speech.silence_detected",

          finalCharacterCount:
            finalText.length,
        },
        "Speech silence detected"
      );

      liveTranscript.clear(
        callId
      );

      try {
        await TranscriptBuffer.addPartial(
          callId,
          finalText
        );

        log.debug(
          {
            event:
              "voice.speech.final_buffered",

            characterCount:
              finalText.length,
          },
          "Final speech text added to transcript buffer"
        );
      } catch (
        error
      ) {
        log.error(
          {
            event:
              "voice.speech.buffer_failed",

            characterCount:
              finalText.length,

            error:
              normalizeError(
                error
              ),
          },
          "Failed to add final speech text to transcript buffer"
        );

        throw error;
      }
    }
  );
}