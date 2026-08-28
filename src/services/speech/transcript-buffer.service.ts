import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  PlaybackState,
} from "@/services/voice/playback-state.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

import {
  TranscriptEvent,
  TranscriptEvents,
} from "./transcript.events";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "transcript-buffer"
  );

//--------------------------------------------------
// Configuration
//--------------------------------------------------

const MAX_BUFFER_CHARACTER_COUNT =
  2_000;

//--------------------------------------------------
// Transcript Buffer
//--------------------------------------------------

class TranscriptBufferService {
  private buffers =
    new Map<
      string,
      {
        committed: string;
        partial: string;
      }
    >();

  //----------------------------------
  // Add Partial Transcript
  //----------------------------------

  async addPartial(
    callId: string,
    text: string
  ): Promise<void> {
    const normalizedText =
      this.normalizeFragment(
        text
      );

    if (
      !normalizedText
    ) {
      return;
    }

    const current =
      this.buffers.get(
        callId
      ) ?? {
        committed: "",
        partial: "",
      };

    /*
     * Add a space between fragments. The previous
     * implementation directly concatenated strings,
     * which could produce text such as:
     *
     * "helloi needinformation"
     */
    const updatedPartial =
      this.combineText(
        current.partial,
        normalizedText
      ).slice(
        0,
        MAX_BUFFER_CHARACTER_COUNT
      );

    this.buffers.set(
      callId,
      {
        ...current,
        partial:
          updatedPartial,
      }
    );

    const updated =
      this.combineText(
        current.committed,
        updatedPartial
      ).slice(
        0,
        MAX_BUFFER_CHARACTER_COUNT
      );

    log.debug(
      {
        event:
          "transcript.buffer.partial_added",

        callId,

        addedCharacterCount:
          normalizedText.length,

        totalCharacterCount:
          updated.length,
      },
      "Partial transcript added to buffer"
    );

    TranscriptEvents.emit(
      TranscriptEvent.PARTIAL,
      {
        callId,

        text:
          updated,

        isFinal:
          false,

        timestamp:
          Date.now(),
      }
    );

    await this.handleBargeIn(
      callId
    );
  }

  //----------------------------------
  // Replace Current Partial
  //----------------------------------

  async setPartial(
    callId: string,
    text: string
  ): Promise<void> {
    const normalizedText =
      this.normalizeFragment(
        text
      );

    if (
      !normalizedText
    ) {
      return;
    }

    const current =
      this.buffers.get(
        callId
      ) ?? {
        committed: "",
        partial: "",
      };

    const boundedPartial =
      normalizedText.slice(
        0,
        MAX_BUFFER_CHARACTER_COUNT
      );

    this.buffers.set(
      callId,
      {
        ...current,
        partial:
          boundedPartial,
      }
    );

    const boundedText =
      this.combineText(
        current.committed,
        boundedPartial
      ).slice(
        0,
        MAX_BUFFER_CHARACTER_COUNT
      );

    log.debug(
      {
        event:
          "transcript.buffer.partial_replaced",

        callId,

        characterCount:
          boundedText.length,
      },
      "Partial transcript buffer replaced"
    );

    TranscriptEvents.emit(
      TranscriptEvent.PARTIAL,
      {
        callId,

        text:
          boundedText,

        isFinal:
          false,

        timestamp:
          Date.now(),
      }
    );

    await this.handleBargeIn(
      callId
    );
  }

  //----------------------------------
  // Commit Finalized STT Segment
  //----------------------------------

  commitFinalSegment(
    callId: string,
    text: string
  ): void {
    const normalizedText =
      this.normalizeFragment(
        text
      );

    if (
      !normalizedText
    ) {
      return;
    }

    const current =
      this.buffers.get(
        callId
      ) ?? {
        committed: "",
        partial: "",
      };

    const committed =
      this.combineText(
        current.committed,
        normalizedText
      ).slice(
        0,
        MAX_BUFFER_CHARACTER_COUNT
      );

    this.buffers.set(
      callId,
      {
        committed,
        partial: "",
      }
    );

    log.debug(
      {
        event:
          "transcript.buffer.final_segment_committed",
        callId,
        segmentCharacterCount:
          normalizedText.length,
        totalCharacterCount:
          committed.length,
      },
      "Finalized STT segment committed to utterance buffer"
    );
  }

  //----------------------------------
  // Flush Final Transcript
  //----------------------------------

  flush(
    callId: string
  ): boolean {
    const buffered =
      this.buffers.get(
        callId
      );

    const text =
      buffered
        ? this.combineText(
            buffered.committed,
            buffered.partial
          )
            .replace(
              /\s+/g,
              " "
            )
            .trim()
        : "";

    if (
      !text
    ) {
      log.debug(
        {
          event:
            "transcript.buffer.flush_skipped",

          callId,

          reason:
            "empty_buffer",
        },
        "Transcript buffer flush skipped"
      );

      return false;
    }

    this.buffers.delete(
      callId
    );

    log.info(
      {
        event:
          "transcript.buffer.final_emitted",

        callId,

        characterCount:
          text.length,
      },
      "Final transcript event emitted"
    );

    TranscriptEvents.emit(
      TranscriptEvent.FINAL,
      {
        callId,

        text,

        timestamp:
          Date.now(),
      }
    );

    return true;
  }

  //----------------------------------
  // Clear Transcript
  //----------------------------------

  clear(
    callId: string
  ): void {
    const existed =
      this.buffers.delete(
        callId
      );

    log.debug(
      {
        event:
          "transcript.buffer.cleared",

        callId,

        existed,
      },
      "Transcript buffer cleared"
    );
  }

  //----------------------------------
  // Read Transcript
  //----------------------------------

  get(
    callId: string
  ): string {
    const buffered =
      this.buffers.get(
        callId
      );

    return buffered
      ? this.combineText(
          buffered.committed,
          buffered.partial
        )
      : "";
  }

  //----------------------------------
  // Normalize Fragment
  //----------------------------------

  private normalizeFragment(
    text: string
  ): string {
    return text
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  //----------------------------------
  // Combine Transcript Text
  //----------------------------------

  private combineText(
    current: string,
    incoming: string
  ): string {
    if (
      !current
    ) {
      return incoming;
    }

    const normalizedCurrent =
      current
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    const normalizedIncoming =
      incoming
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    /*
     * Some STT providers send cumulative partial
     * transcripts. Replace the old value when the
     * incoming text already contains it.
     */
    if (
      normalizedIncoming
        .toLowerCase()
        .startsWith(
          normalizedCurrent.toLowerCase()
        )
    ) {
      return normalizedIncoming;
    }

    /*
     * Ignore an incoming fragment that is already
     * represented at the end of the current buffer.
     */
    if (
      normalizedCurrent
        .toLowerCase()
        .endsWith(
          normalizedIncoming.toLowerCase()
        )
    ) {
      return normalizedCurrent;
    }

    return `${normalizedCurrent} ${normalizedIncoming}`
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  //----------------------------------
  // Handle Barge-In
  //----------------------------------

  private async handleBargeIn(
    callId: string
  ): Promise<void> {
    if (
      !PlaybackState.isPlaying(
        callId
      ) ||
      ConversationStateService.getState(
        callId
      ) ===
        "INTERRUPTING"
    ) {
      return;
    }

    log.info(
      {
        event:
          "transcript.barge_in.detected",

        callId,
      },
      "Caller barge-in detected"
    );

    try {
      await VoiceWorker.interrupt(
        callId
      );
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "transcript.barge_in.interrupt_failed",

          callId,

          error:
            normalizeError(
              error
            ),
        },
        "Failed to interrupt voice playback"
      );

      throw error;
    }
  }
}

export const TranscriptBuffer =
  new TranscriptBufferService();
