import {
  createServerLogger,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "partial-transcript-service"
  );

//--------------------------------------------------
// Transcript Storage
//--------------------------------------------------

const transcripts =
  new Map<string, string>();

//--------------------------------------------------
// Partial Transcript Service
//--------------------------------------------------

export const PartialTranscriptService = {
  update(
    callId: string,
    transcript: string
  ): void {
    transcripts.set(
      callId,
      transcript
    );

    log.debug(
      {
        event:
          "conversation.partial_transcript.updated",

        callId,

        characterCount:
          transcript.length,
      },
      "Partial transcript updated"
    );
  },

  append(
    callId: string,
    text: string
  ): void {
    const current =
      transcripts.get(
        callId
      ) ??
      "";

    const updated =
      current.length ===
      0
        ? text
        : `${current} ${text}`;

    transcripts.set(
      callId,
      updated
    );

    log.debug(
      {
        event:
          "conversation.partial_transcript.appended",

        callId,

        appendedCharacterCount:
          text.length,

        totalCharacterCount:
          updated.length,
      },
      "Partial transcript appended"
    );
  },

  get(
    callId: string
  ): string {
    return (
      transcripts.get(
        callId
      ) ??
      ""
    );
  },

  clear(
    callId: string
  ): void {
    const existed =
      transcripts.delete(
        callId
      );

    log.debug(
      {
        event:
          "conversation.partial_transcript.cleared",

        callId,

        existed,
      },
      "Partial transcript cleared"
    );
  },
};