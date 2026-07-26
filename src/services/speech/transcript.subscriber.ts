import {
  TranscriptEvents,
  TranscriptEvent,
} from "./transcript.events";

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import {
  EventSubscriber,
  AppEvent,
} from "@/core/events";

import {
  CallPayload,
} from "@/core/events/payloads/call.payload";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  sentenceBuffer,
} from "@/services/voice/sentence-buffer.service";

import {
  voiceQueue,
} from "@/services/voice/voice-queue.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

//--------------------------------------------------
// Pending Transcript
//--------------------------------------------------

interface PendingTranscript {
  text: string;

  normalizedText: string;

  timestamp: number;
}

//--------------------------------------------------
// Configuration
//--------------------------------------------------

const DUPLICATE_WINDOW_MS =
  3_000;

const MAX_PENDING_TRANSCRIPTS_PER_CALL =
  5;

//--------------------------------------------------
// Normalize Transcript
//--------------------------------------------------

function normalizeText(
  text: string
): string {
  return text
    .toLowerCase()
    .trim()
    .replace(
      /[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    );
}

//--------------------------------------------------
// Transcript Subscriber
//--------------------------------------------------

export class TranscriptSubscriber {
  private static registered =
    false;

  /*
   * Tracks recently accepted transcripts so
   * duplicate Deepgram FINAL events are ignored.
   */
  private static lastTranscripts =
    new Map<
      string,
      {
        text: string;

        timestamp: number;
      }
    >();

  /*
   * Guarantees that only one processUserMessage()
   * execution runs for a call at a time.
   */
  private static activeTurns =
    new Set<string>();

  /*
   * Final transcripts received while the AI is
   * thinking or speaking are stored here rather
   * than discarded.
   */
  private static pendingTranscripts =
    new Map<
      string,
      PendingTranscript[]
    >();

  //--------------------------------------------------
  // Clean Call State
  //--------------------------------------------------

  static cleanDedupeState(
    callId: string
  ): void {
    this.lastTranscripts.delete(
      callId
    );

    this.activeTurns.delete(
      callId
    );

    this.pendingTranscripts.delete(
      callId
    );

    sentenceBuffer.clear(
      callId
    );

    voiceQueue.clear(
      callId
    );

    const state =
      ConversationStateService.getState(
        callId
      );

    if (
      state !==
      "ENDED"
    ) {
      ConversationStateService.setState(
        callId,
        "ENDED"
      );
    }

    console.log(
      `🧹 Transcript state and buffers cleaned for callId: ${callId}`
    );
  }

  //--------------------------------------------------
  // Register Subscriber
  //--------------------------------------------------

  static register():
    void {
    if (
      this.registered
    ) {
      console.log(
        "⚠️ TranscriptSubscriber already registered"
      );

      return;
    }

    this.registered =
      true;

    console.log(
      "✅ TranscriptSubscriber Registered"
    );

    //------------------------------------------------
    // Audio Session Cleanup
    //------------------------------------------------

    AudioSessionService.onClose(
      (
        callId
      ) => {
        this.cleanDedupeState(
          callId
        );

        VoiceWorker.stop(
          callId
        );
      }
    );

    //------------------------------------------------
    // Backup Event Cleanup
    //------------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_COMPLETED,
      async (
        payload
      ) => {
        this.cleanDedupeState(
          payload.callId
        );
      }
    );

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_FAILED,
      async (
        payload
      ) => {
        this.cleanDedupeState(
          payload.callId
        );
      }
    );

    //------------------------------------------------
    // Final Transcript Listener
    //------------------------------------------------

    TranscriptEvents.on(
      TranscriptEvent.FINAL,
      async (
        payload
      ) => {
        const callId =
          payload.callId;

        const log =
          createCallLogger(
            callId
          );

        console.log(
          "🔥 FINAL EVENT RECEIVED"
        );

        console.log(
          payload
        );

        //------------------------------------------
        // Confirm Active Call Session
        //------------------------------------------

        if (
          !AudioSessionService
            .getByCallId(
              callId
            )
        ) {
          console.log(
            `Transcript ignored because call session does not exist for callId: ${callId}`
          );

          log.warn(
            "Transcript ignored because call session does not exist"
          );

          return;
        }

        //------------------------------------------
        // Validate Transcript
        //------------------------------------------

        const text =
          payload.text
            ?.trim();

        if (
          !text
        ) {
          log.warn(
            "Empty final transcript ignored"
          );

          return;
        }

        const normalizedText =
          normalizeText(
            text
          );

        if (
          !normalizedText
        ) {
          log.warn(
            "Final transcript contained no usable text"
          );

          return;
        }

        //------------------------------------------
        // Duplicate Protection
        //------------------------------------------

        const now =
          Date.now();

        const last =
          this.lastTranscripts.get(
            callId
          );

        if (
          last &&
          last.text ===
            normalizedText &&
          now -
            last.timestamp <
            DUPLICATE_WINDOW_MS
        ) {
          console.log(
            "Duplicate transcript ignored"
          );

          log.info(
            {
              transcript:
                text,
            },
            "Duplicate transcript ignored"
          );

          return;
        }

        /*
         * Record the transcript as soon as it is
         * accepted into the queue. This prevents
         * repeated FINAL events from being queued.
         */
        this.lastTranscripts.set(
          callId,
          {
            text:
              normalizedText,

            timestamp:
              now,
          }
        );

        //------------------------------------------
        // Add Transcript To Pending Queue
        //------------------------------------------

        const queued =
          this.enqueueTranscript(
            callId,
            {
              text,

              normalizedText,

              timestamp:
                now,
            }
          );

        if (
          !queued
        ) {
          log.warn(
            {
              transcript:
                text,

              maximumQueueSize:
                MAX_PENDING_TRANSCRIPTS_PER_CALL,
            },
            "Transcript queue was full"
          );

          return;
        }

        //------------------------------------------
        // Start Or Continue Queue Processing
        //------------------------------------------

        await this.drainPendingTranscripts(
          callId
        );
      }
    );
  }

  //--------------------------------------------------
  // Enqueue Transcript
  //--------------------------------------------------

  private static enqueueTranscript(
    callId: string,
    transcript:
      PendingTranscript
  ): boolean {
    const queue =
      this.pendingTranscripts.get(
        callId
      ) ??
      [];

    /*
     * Protect against duplicate text already waiting
     * in the pending queue.
     */
    const alreadyQueued =
      queue.some(
        item =>
          item.normalizedText ===
          transcript.normalizedText
      );

    if (
      alreadyQueued
    ) {
      console.log(
        "Duplicate queued transcript ignored",
        {
          callId,

          transcript:
            transcript.text,
        }
      );

      return false;
    }

    //------------------------------------------
    // Enforce Bounded Queue
    //------------------------------------------

    if (
      queue.length >=
      MAX_PENDING_TRANSCRIPTS_PER_CALL
    ) {
      /*
       * Remove the oldest pending transcript and
       * preserve the caller's most recent request.
       */
      const removed =
        queue.shift();

      console.warn(
        "Pending transcript queue limit reached; oldest transcript removed",
        {
          callId,

          removedTranscript:
            removed?.text,

          incomingTranscript:
            transcript.text,

          maximumQueueSize:
            MAX_PENDING_TRANSCRIPTS_PER_CALL,
        }
      );
    }

    queue.push(
      transcript
    );

    this.pendingTranscripts.set(
      callId,
      queue
    );

    const active =
      this.activeTurns.has(
        callId
      );

    const state =
      ConversationStateService.getState(
        callId
      );

    if (
      active ||
      state !==
        "LISTENING"
    ) {
      console.log(
        "🕒 Transcript queued while conversation turn is active",
        {
          callId,

          transcript:
            transcript.text,

          state,

          pendingCount:
            queue.length,
        }
      );
    }

    return true;
  }

  //--------------------------------------------------
  // Process Pending Transcripts
  //--------------------------------------------------

  private static async drainPendingTranscripts(
    callId: string
  ): Promise<void> {
    /*
     * Another drain loop is already processing this
     * call. The newly queued transcript will be picked
     * up by that loop.
     */
    if (
      this.activeTurns.has(
        callId
      )
    ) {
      return;
    }

    /*
     * Mark the call as active for the entire drain
     * operation so two asynchronous FINAL events
     * cannot start parallel processing loops.
     */
    this.activeTurns.add(
      callId
    );

    const log =
      createCallLogger(
        callId
      );

    try {
      while (
        true
      ) {
        //----------------------------------------
        // Confirm Call Still Exists
        //----------------------------------------

        if (
          !AudioSessionService
            .getByCallId(
              callId
            )
        ) {
          this.pendingTranscripts.delete(
            callId
          );

          log.warn(
            "Pending transcript processing stopped because the call session ended"
          );

          return;
        }

        //----------------------------------------
        // Read Queue
        //----------------------------------------

        const queue =
          this.pendingTranscripts.get(
            callId
          );

        if (
          !queue ||
          queue.length ===
            0
        ) {
          this.pendingTranscripts.delete(
            callId
          );

          return;
        }

        //----------------------------------------
        // Confirm Conversation Is Ready
        //----------------------------------------

        const state =
          ConversationStateService.getState(
            callId
          );

        if (
          state ===
          "ENDED"
        ) {
          this.pendingTranscripts.delete(
            callId
          );

          log.warn(
            "Pending transcripts removed because the conversation ended"
          );

          return;
        }

        /*
         * Normally processUserMessage() returns only
         * after state returns to LISTENING.
         *
         * This guard protects against another service
         * temporarily changing the state.
         */
        if (
          state !==
          "LISTENING"
        ) {
          console.log(
            "Pending transcript waiting for LISTENING state",
            {
              callId,

              state,

              pendingCount:
                queue.length,
            }
          );

          /*
           * Stop this drain attempt. A later FINAL
           * event or the current conversation turn
           * completion will invoke the drain again.
           */
          return;
        }

        //----------------------------------------
        // Remove Next Transcript
        //----------------------------------------

        const nextTranscript =
          queue.shift();

        if (
          queue.length ===
          0
        ) {
          this.pendingTranscripts.delete(
            callId
          );
        } else {
          this.pendingTranscripts.set(
            callId,
            queue
          );
        }

        if (
          !nextTranscript
        ) {
          return;
        }

        //----------------------------------------
        // Process Conversation Turn
        //----------------------------------------

        log.info(
          {
            transcript:
              nextTranscript.text,

            queuedAt:
              new Date(
                nextTranscript.timestamp
              ).toISOString(),

            remainingPending:
              queue.length,
          },
          "Final transcript processing started"
        );

        try {
          await processUserMessage(
            callId,
            nextTranscript.text
          );

          log.info(
            {
              transcript:
                nextTranscript.text,

              remainingPending:
                queue.length,
            },
            "Final transcript processing completed"
          );
        } catch (
          error
        ) {
          log.error(
            {
              error:
                normalizeError(
                  error
                ),

              transcript:
                nextTranscript.text,
            },
            "Conversation engine failed"
          );

          /*
           * Continue with the next pending transcript
           * when the call is still active.
           */
        }
      }
    } finally {
      this.activeTurns.delete(
        callId
      );

      //------------------------------------------
      // Handle Race At Loop Completion
      //------------------------------------------

      /*
       * A transcript could be queued immediately
       * before activeTurns was cleared. Start another
       * drain pass when the call is ready.
       */
      const remainingQueue =
        this.pendingTranscripts.get(
          callId
        );

      const state =
        ConversationStateService.getState(
          callId
        );

      if (
        remainingQueue &&
        remainingQueue.length >
          0 &&
        state ===
          "LISTENING" &&
        AudioSessionService
          .getByCallId(
            callId
          )
      ) {
        void this.drainPendingTranscripts(
          callId
        );
      }
    }
  }

  //--------------------------------------------------
  // Pending Queue Diagnostics
  //--------------------------------------------------

  static getPendingTranscriptCount(
    callId: string
  ): number {
    return (
      this.pendingTranscripts
        .get(
          callId
        )
        ?.length ??
      0
    );
  }
}

//--------------------------------------------------
// Normalize Error
//--------------------------------------------------

function normalizeError(
  error: unknown
) {
  if (
    error instanceof
    Error
  ) {
    return {
      name:
        error.name,

      message:
        error.message,

      stack:
        error.stack,
    };
  }

  return {
    message:
      String(
        error
      ),
  };
}