import {
  createServerLogger,
} from "@/lib/logger";

import {
  TranscriptBuffer,
} from "@/services/speech/transcript-buffer.service";

//--------------------------------------------------
// Types
//--------------------------------------------------

interface DeepgramAlternative {
  transcript?: string;
  confidence?: number;
}

interface DeepgramPayload {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;

  channel?: {
    alternatives?:
      DeepgramAlternative[];
  };
}

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "deepgram-events"
  );

//--------------------------------------------------
// Deepgram Events
//--------------------------------------------------

export class DeepgramEvents {
  static async handle(
    callId: string,
    payload: DeepgramPayload
  ): Promise<void> {
    if (
      payload.type &&
      payload.type !==
        "Results"
    ) {
      return;
    }

    const alternative =
      payload.channel
        ?.alternatives?.[0];

    const transcript =
      alternative
        ?.transcript
        ?.trim() ??
      "";

    if (
      !transcript
    ) {
      return;
    }

    const isFinal =
      Boolean(
        payload.speech_final ||
        payload.is_final
      );

    await TranscriptBuffer.setPartial(
      callId,
      transcript
    );

    log.debug(
      {
        event:
          isFinal
            ? "deepgram.transcript.final_received"
            : "deepgram.transcript.partial_received",

        callId,

        isFinal,

        characterCount:
          transcript.length,

        confidence:
          alternative
            ?.confidence ??
          null,
      },
      isFinal
        ? "Deepgram final transcript received"
        : "Deepgram partial transcript received"
    );

    if (
      isFinal
    ) {
      TranscriptBuffer.flush(
        callId
      );
    }
  }
}