import {
  TTSAudioChunk,
} from "@/services/voice/types";

import {
  createCallLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Delay
//--------------------------------------------------

function delay(
  milliseconds: number
): Promise<void> {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

//--------------------------------------------------
// Play Audio
//--------------------------------------------------

export async function playAudio(
  callId: string,
  chunk: TTSAudioChunk
): Promise<void> {
  const startedAt =
    process.hrtime.bigint();

  const log =
    createCallLogger(
      callId
    );

  const audioSizeBytes =
    chunk.audio.length;

  const textCharacterCount =
    chunk.text.length;

  const words =
    chunk.text
      .split(
        /\s+/
      )
      .filter(
        Boolean
      );

  log.info(
    {
      event:
        "telephony.playback.started",

      chunkId:
        chunk.id,

      audioSizeBytes,

      textCharacterCount,

      wordCount:
        words.length,
    },
    "Audio playback started"
  );

  try {
    //--------------------------------------------------
    // Mock Streaming Playback
    //--------------------------------------------------

    for (
      const _word of
      words
    ) {
      /*
       * The word is intentionally not printed.
       * This mock delay simulates streamed playback.
       */
      await delay(
        120
      );
    }

    log.info(
      {
        event:
          "telephony.playback.completed",

        chunkId:
          chunk.id,

        audioSizeBytes,

        textCharacterCount,

        wordCount:
          words.length,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Audio playback completed"
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "telephony.playback.failed",

        chunkId:
          chunk.id,

        audioSizeBytes,

        textCharacterCount,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Audio playback failed"
    );

    throw error;
  }
}