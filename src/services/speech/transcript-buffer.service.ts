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
    new Map<string, string>();

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
      ) ??
      "";

    /*
     * Add a space between fragments. The previous
     * implementation directly concatenated strings,
     * which could produce text such as:
     *
     * "helloi needinformation"
     */
    const updated =
      this.combineText(
        current,
        normalizedText
      ).slice(
        0,
        MAX_BUFFER_CHARACTER_COUNT
      );

    this.buffers.set(
      callId,
      updated
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

    const boundedText =
      normalizedText.slice(
        0,
        MAX_BUFFER_CHARACTER_COUNT
      );

    this.buffers.set(
      callId,
      boundedText
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
  // Flush Final Transcript
  //----------------------------------

  flush(
    callId: string
  ): void {
    const bufferedText =
      this.buffers.get(
        callId
      );

    const text =
      bufferedText
        ?.replace(
          /\s+/g,
          " "
        )
        .trim();

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

      return;
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
    return (
      this.buffers.get(
        callId
      ) ??
      ""
    );
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