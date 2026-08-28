import {
  TranscriptEvent,
  TranscriptEvents,
} from "./transcript.events";

import {
  processUserMessage,
} from "@/services/conversations/conversation-engine.service";

import {
  TurnCoordinator,
} from "@/services/voice-runtime/turn-coordinator.service";

import {
  CascadedTurnLatency,
  type CascadedRouteClassification,
} from "@/services/voice-runtime/cascaded-turn-latency.service";

import {
  createCallLogger,
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import {
  shouldPreserveCallAfterMediaStop,
} from "@/services/telephony/human-transfer-lifecycle.service";

import {
  AppEvent,
  EventSubscriber,
} from "@/core/events";

import {
  routeRealtimeCallInput,
} from "@/services/conversations/realtime-input.service";

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

import { STANDARD_REALTIME_CONFIG } from "@/config/standard-realtime";
import { StandardPartialPrefetch } from "@/services/voice-runtime/standard-partial-prefetch.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "transcript-subscriber"
  );

//--------------------------------------------------
// Pending Transcript
//--------------------------------------------------

interface PendingTranscript {
  /*
   * Transcript text is required internally for
   * conversation processing, but must not be logged.
   */
  text: string;

  normalizedText: string;

  /*
   * Time when the first fragment of this utterance
   * was accepted.
   */
  timestamp: number;

  /*
   * Time when the latest fragment was merged.
   */
  lastUpdatedAt: number;

  fragmentCount: number;
}

//--------------------------------------------------
// Configuration
//--------------------------------------------------

const DUPLICATE_WINDOW_MS =
  3_000;

/*
 * Wait after the most recent FINAL result before
 * processing. This allows fragmented FINAL results
 * from one spoken sentence to be merged.
 */
const DEFAULT_UTTERANCE_MERGE_WINDOW_MS =
  STANDARD_REALTIME_CONFIG.finalMergeMs;

const configuredUtteranceMergeWindowMs =
  Number(
    process.env
      .UTTERANCE_MERGE_WINDOW_MS
  );

const UTTERANCE_MERGE_WINDOW_MS =
  Number.isInteger(
    configuredUtteranceMergeWindowMs
  ) &&
  configuredUtteranceMergeWindowMs >=
    0 &&
  configuredUtteranceMergeWindowMs <=
    2_000
    ? configuredUtteranceMergeWindowMs
    : DEFAULT_UTTERANCE_MERGE_WINDOW_MS;

const MAX_PENDING_TRANSCRIPTS_PER_CALL =
  1;

const MAX_UTTERANCE_CHARACTER_COUNT =
  1_500;

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
// Clean Display Text
//--------------------------------------------------

function cleanDisplayText(
  text: string
): string {
  return text
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

//--------------------------------------------------
// Transcript Subscriber
//--------------------------------------------------

export class TranscriptSubscriber {
  private static registered =
    false;

  /*
   * Tracks recently processed or accepted text so
   * repeated Deepgram FINAL events are ignored.
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
   * Ensures only one processUserMessage() execution
   * runs for a call at a time.
   */
  private static activeTurns =
    new Set<string>();

  /*
   * Stores finalized utterances waiting for
   * conversation processing.
   */
  private static pendingTranscripts =
    new Map<
      string,
      PendingTranscript[]
    >();

  /*
   * Debounces FINAL transcript processing so nearby
   * fragments can be combined into one utterance.
   */
  private static drainTimers =
    new Map<
      string,
      NodeJS.Timeout
    >();

  //--------------------------------------------------
  // Clean Call State
  //--------------------------------------------------

  static cleanDedupeState(
    callId: string
  ): void {
    const log =
      createCallLogger(
        callId
      );

    const pendingCount =
      this.pendingTranscripts
        .get(
          callId
        )
        ?.length ??
      0;

    const previousState =
      ConversationStateService.getState(
        callId
      );

    //--------------------------------------------
    // Cancel Scheduled Processing
    //--------------------------------------------

    const drainTimer =
      this.drainTimers.get(
        callId
      );

    if (
      drainTimer
    ) {
      clearTimeout(
        drainTimer
      );

      this.drainTimers.delete(
        callId
      );
    }

    //--------------------------------------------
    // Remove Transcript Processing State
    //--------------------------------------------

    this.lastTranscripts.delete(
      callId
    );

    StandardPartialPrefetch.clear(
      callId
    );

    this.activeTurns.delete(
      callId
    );

    this.pendingTranscripts.delete(
      callId
    );

    //--------------------------------------------
    // Remove Voice Queues And Buffers
    //--------------------------------------------

    sentenceBuffer.clear(
      callId
    );

    voiceQueue.clear(
      callId
    );

    //--------------------------------------------
    // Clean Coordinated Conversation Turn
    //--------------------------------------------

    TurnCoordinator.cleanup(
      callId
    );

    //--------------------------------------------
    // Remove Conversation State From Memory
    //--------------------------------------------

    ConversationStateService.clearState(
      callId
    );

    log.debug(
      {
        event:
          "transcript.state.cleaned",

        previousState,

        removedPendingCount:
          pendingCount,
      },
      "Transcript state and conversation memory cleaned"
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
      serviceLog.debug(
        {
          event:
            "transcript.subscriber.registration_skipped",

          reason:
            "already_registered",
        },
        "Transcript subscriber is already registered"
      );

      return;
    }

    this.registered =
      true;

    serviceLog.info(
      {
        event:
          "transcript.subscriber.registered",

        duplicateWindowMs:
          DUPLICATE_WINDOW_MS,

        utteranceMergeWindowMs:
          UTTERANCE_MERGE_WINDOW_MS,

        maximumPendingPerCall:
          MAX_PENDING_TRANSCRIPTS_PER_CALL,

        maximumUtteranceCharacterCount:
          MAX_UTTERANCE_CHARACTER_COUNT,
      },
      "Transcript subscriber registered"
    );

    //------------------------------------------------
    // Audio Session Cleanup
    //------------------------------------------------

AudioSessionService.onClose(
  callId => {
    void (
      async () => {
        //------------------------------------------------
        // Always Clear Transcript Runtime
        //------------------------------------------------

        this.cleanDedupeState(
          callId
        );

        //------------------------------------------------
        // Media Stop During Human Transfer
        //------------------------------------------------

        const preserveCall =
          await shouldPreserveCallAfterMediaStop(
            callId
          );

        if (
          preserveCall
        ) {
          const log =
            createCallLogger(
              callId
            );

          log.info(
            {
              event:
                "transcript.audio_close_transfer_preserved",
            },
            "Audio session closed during human transfer; parent call state preserved"
          );

          /*
           * IMPORTANT:
           *
           * Do NOT call VoiceWorker.stop().
           *
           * VoiceWorker.stop() sets the conversational
           * state to ENDED, but a Twilio Media Stream
           * ending during transfer does not mean the
           * underlying parent phone call ended.
           */
          return;
        }

        //------------------------------------------------
        // Normal Media/Call Shutdown
        //------------------------------------------------

        VoiceWorker.stop(
          callId
        );
      }
    )().catch(
      error => {
        const log =
          createCallLogger(
            callId
          );

        log.error(
          {
            event:
              "transcript.audio_close_cleanup_failed",

            error:
              normalizeError(
                error
              ),
          },
          "Audio-session close cleanup failed"
        );

        /*
         * Fail safe:
         *
         * If transfer-state lookup itself fails, do not
         * force the call into ENDED from this listener.
         * The real provider call-status callback owns
         * terminal parent-call state.
         */
      }
    );
  }
);

    //------------------------------------------------
    // Backup Event Cleanup
    //------------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_COMPLETED,
      async payload => {
        VoiceWorker.stop(
          payload.callId
        );

        this.cleanDedupeState(
          payload.callId
        );
      }
    );

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_FAILED,
      async payload => {
        VoiceWorker.stop(
          payload.callId
        );

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
      async payload => {
        const callId =
          payload.callId;

        const log =
          createCallLogger(
            callId
          );

        log.debug(
          {
            event:
              "transcript.final.received",

            characterCount:
              payload.text
                ?.length ??
              0,
          },
          "Final transcript event received"
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
          log.warn(
            {
              event:
                "transcript.final.ignored",

              reason:
                "call_session_not_found",
            },
            "Transcript ignored because call session does not exist"
          );

          return;
        }

        //------------------------------------------
        // Validate Transcript
        //------------------------------------------

        const text =
          cleanDisplayText(
            payload.text ??
              ""
          );

        if (
          !text
        ) {
          log.warn(
            {
              event:
                "transcript.final.ignored",

              reason:
                "empty_transcript",
            },
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
            {
              event:
                "transcript.final.ignored",

              reason:
                "no_usable_text",

              characterCount:
                text.length,
            },
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
          log.info(
            {
              event:
                "transcript.final.duplicate_ignored",

              characterCount:
                text.length,

              duplicateWindowMs:
                DUPLICATE_WINDOW_MS,

              millisecondsSincePrevious:
                now -
                last.timestamp,
            },
            "Duplicate transcript ignored"
          );

          return;
        }

        //------------------------------------------
        // Add Or Merge Transcript
        //------------------------------------------

        const queued =
          this.enqueueTranscript(
            callId,
            {
              text,

              normalizedText,

              timestamp:
                now,

              lastUpdatedAt:
                now,

              fragmentCount:
                1,
            }
          );

        if (
          !queued
        ) {
          log.debug(
            {
              event:
                "transcript.queue.not_changed",

              incomingCharacterCount:
                text.length,

              currentPendingCount:
                this.getPendingTranscriptCount(
                  callId
                ),
            },
            "Transcript queue was not changed"
          );

          return;
        }

        CascadedTurnLatency.markMergeWindowStart(
          callId
        );

        /*
         * Remember the incoming fragment after it is
         * accepted. This suppresses exact repeated
         * FINAL events.
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
        // Schedule Queue Processing
        //------------------------------------------

        this.scheduleDrain(
          callId
        );
      }
    );
  }

  //--------------------------------------------------
  // Schedule Transcript Processing
  //--------------------------------------------------

  private static scheduleDrain(
    callId: string
  ): void {
    const existingTimer =
      this.drainTimers.get(
        callId
      );

    if (
      existingTimer
    ) {
      clearTimeout(
        existingTimer
      );
    }

    const newest = this.pendingTranscripts
      .get(callId)
      ?.at(-1);

    const delayMs =
      newest && /[.!?]$/.test(newest.text)
        ? STANDARD_REALTIME_CONFIG.punctuationMergeMs
        : UTTERANCE_MERGE_WINDOW_MS;

    const timer =
      setTimeout(
        () => {
          this.drainTimers.delete(
            callId
          );

          void this.drainPendingTranscripts(
            callId
          );
        },
        delayMs
      );

    this.drainTimers.set(
      callId,
      timer
    );
  }

  //--------------------------------------------------
  // Enqueue Or Merge Transcript
  //--------------------------------------------------

  private static enqueueTranscript(
    callId: string,
    transcript:
      PendingTranscript
  ): boolean {
    const log =
      createCallLogger(
        callId
      );

    const queue =
      this.pendingTranscripts.get(
        callId
      ) ??
      [];

    const lastQueued =
      queue.length >
        0
        ? queue[
            queue.length -
              1
          ]
        : undefined;

    //------------------------------------------
    // Merge Nearby Final Fragments
    //------------------------------------------

    if (
      lastQueued &&
      transcript.timestamp -
        lastQueued.lastUpdatedAt <=
        UTTERANCE_MERGE_WINDOW_MS
    ) {
      const previousNormalized =
        lastQueued.normalizedText;

      const incomingNormalized =
        transcript.normalizedText;

      /*
       * Exact repeated fragment.
       */
      if (
        incomingNormalized ===
        previousNormalized
      ) {
        log.debug(
          {
            event:
              "transcript.queue.fragment_duplicate_ignored",

            incomingCharacterCount:
              transcript.text.length,

            pendingCount:
              queue.length,
          },
          "Repeated final transcript fragment ignored"
        );

        return false;
      }

      /*
       * Deepgram can send cumulative results:
       *
       * "I need information"
       * "I need information about pricing"
       *
       * Replace the previous fragment rather than
       * appending duplicate words.
       */
      if (
        incomingNormalized.startsWith(
          previousNormalized
        )
      ) {
        lastQueued.text =
          transcript.text.slice(
            0,
            MAX_UTTERANCE_CHARACTER_COUNT
          );

        lastQueued.normalizedText =
          incomingNormalized.slice(
            0,
            MAX_UTTERANCE_CHARACTER_COUNT
          );

        lastQueued.lastUpdatedAt =
          transcript.timestamp;

        lastQueued.fragmentCount +=
          1;

        this.pendingTranscripts.set(
          callId,
          queue
        );

        log.debug(
          {
            event:
              "transcript.queue.cumulative_fragment_replaced",

            mergedCharacterCount:
              lastQueued.text.length,

            fragmentCount:
              lastQueued.fragmentCount,

            pendingCount:
              queue.length,
          },
          "Cumulative final transcript replaced previous fragment"
        );

        return true;
      }

      /*
       * The incoming result may be a shorter version
       * already contained in the previous result.
       */
      if (
        previousNormalized.startsWith(
          incomingNormalized
        ) ||
        previousNormalized.endsWith(
          incomingNormalized
        )
      ) {
        lastQueued.lastUpdatedAt =
          transcript.timestamp;

        log.debug(
          {
            event:
              "transcript.queue.contained_fragment_ignored",

            incomingCharacterCount:
              transcript.text.length,

            pendingCount:
              queue.length,
          },
          "Contained transcript fragment ignored"
        );

        return true;
      }

      /*
       * Normal segmented results:
       *
       * "I need information"
       * "about your service"
       *
       * Combine them into one utterance.
       */
      const combinedText =
        cleanDisplayText(
          `${lastQueued.text} ${transcript.text}`
        ).slice(
          0,
          MAX_UTTERANCE_CHARACTER_COUNT
        );

      lastQueued.text =
        combinedText;

      lastQueued.normalizedText =
        normalizeText(
          combinedText
        ).slice(
          0,
          MAX_UTTERANCE_CHARACTER_COUNT
        );

      lastQueued.lastUpdatedAt =
        transcript.timestamp;

      lastQueued.fragmentCount +=
        1;

      this.pendingTranscripts.set(
        callId,
        queue
      );

      log.info(
        {
          event:
            "transcript.queue.fragments_merged",

          mergedCharacterCount:
            lastQueued.text.length,

          fragmentCount:
            lastQueued.fragmentCount,

          pendingCount:
            queue.length,
        },
        "Final transcript fragments merged into one utterance"
      );

      return true;
    }

    //------------------------------------------
    // Prevent Duplicate Queue Entries
    //------------------------------------------

    const alreadyQueued =
      queue.some(
        item =>
          item.normalizedText ===
          transcript.normalizedText
      );

    if (
      alreadyQueued
    ) {
      log.debug(
        {
          event:
            "transcript.queue.duplicate_ignored",

          characterCount:
            transcript.text.length,

          pendingCount:
            queue.length,
        },
        "Duplicate queued transcript ignored"
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
      const removed =
        queue.shift();

      log.warn(
        {
          event:
            "transcript.queue.oldest_removed",

          removedCharacterCount:
            removed?.text.length ??
            0,

          incomingCharacterCount:
            transcript.text.length,

          maximumQueueSize:
            MAX_PENDING_TRANSCRIPTS_PER_CALL,
        },
        "Pending transcript queue limit reached; oldest transcript removed"
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
      log.debug(
        {
          event:
            "transcript.queue.waiting",

          state,

          activeTurn:
            active,

          pendingCount:
            queue.length,

          characterCount:
            transcript.text.length,
        },
        "Transcript queued while conversation turn is active"
      );
    } else {
      log.debug(
        {
          event:
            "transcript.queue.added",

          pendingCount:
            queue.length,

          characterCount:
            transcript.text.length,
        },
        "Transcript added to pending queue"
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
     * Cancel any remaining scheduled timer because
     * processing is beginning now.
     */
    const scheduledTimer =
      this.drainTimers.get(
        callId
      );

    if (
      scheduledTimer
    ) {
      clearTimeout(
        scheduledTimer
      );

      this.drainTimers.delete(
        callId
      );
    }

    /*
     * Another drain loop is already processing this
     * call. Newly queued text will be handled later.
     */
    if (
      this.activeTurns.has(
        callId
      )
    ) {
      return;
    }

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
          const removedPendingCount =
            this.pendingTranscripts
              .get(
                callId
              )
              ?.length ??
            0;

          this.pendingTranscripts.delete(
            callId
          );

          log.warn(
            {
              event:
                "transcript.processing.stopped",

              reason:
                "call_session_ended",

              removedPendingCount,
            },
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
          const removedPendingCount =
            queue.length;

          this.pendingTranscripts.delete(
            callId
          );

          log.warn(
            {
              event:
                "transcript.processing.stopped",

              reason:
                "conversation_ended",

              removedPendingCount,
            },
            "Pending transcripts removed because conversation ended"
          );

          return;
        }

        if (
          state !==
          "LISTENING"
        ) {
          log.debug(
            {
              event:
                "transcript.processing.waiting",

              state,

              pendingCount:
                queue.length,
            },
            "Pending transcript waiting for LISTENING state"
          );

          return;
        }

        //----------------------------------------
        // Remove Next Combined Utterance
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

        const processingStartedAt =
          Date.now();

        const {
          turnId,
          generationId,
          signal,
        } =
          TurnCoordinator.beginTurn(
            callId
          );

        StandardPartialPrefetch.claimFinal(
          callId,
          nextTranscript.text,
          turnId,
          generationId
        );

        CascadedTurnLatency.markMergeWindowComplete(
          callId
        );

        log.info(
          {
            event:
              "transcript.processing.started",

            turnId,

            characterCount:
              nextTranscript.text.length,

            fragmentCount:
              nextTranscript.fragmentCount,

            queueDelayMs:
              Math.max(
                0,
                processingStartedAt -
                  nextTranscript.timestamp
              ),

            remainingPending:
              queue.length,
          },
          "Final transcript processing started"
        );

try {
  //------------------------------------------------
  // Route Business Workflow Before Normal AI
  //------------------------------------------------

        CascadedTurnLatency.startRoutingPass(
          callId,
          "realtimeInput"
        );

        const realtimeRoute = await routeRealtimeCallInput({
          type: "VOICE",
          callId,
          provider: "TWILIO",
          text: nextTranscript.text,
          isFinal: true,
          timestamp: nextTranscript.timestamp,
        }, { turnId, recordConversationMessage: true });

        const liveRoute = realtimeRoute.liveRoute ?? {
          handled: realtimeRoute.handled,
          response: realtimeRoute.speechText,
          reason: "BUSINESS_WORKFLOW" as const,
          audioQueued: realtimeRoute.handled,
        };

        const liveRouteClassification:
          CascadedRouteClassification =
          liveRoute.handled
            ? "IVR_HANDLED"
            : "GENERAL_AI";

        CascadedTurnLatency.completeRoutingPass(
          callId,
          "realtimeInput",
          liveRouteClassification
        );

        if (
          liveRoute.outcome
        ) {
          log.info(
            {
              event:
                "transcript.processing.voice_outcome",

              turnId,

              intent:
                liveRoute.outcome.intent,

              confidence:
                liveRoute.outcome.confidence,

              requestedAction:
                liveRoute.outcome.requestedAction,

              requiresConfirmation:
                liveRoute.outcome.requiresConfirmation,

              handled:
                liveRoute.outcome.handled,

              responsePresent:
                Boolean(
                  liveRoute.outcome.response
                ),
            },
            "Structured voice outcome resolved"
          );
        }

  //------------------------------------------------
  // Normal Conversation Only If Not Handled
  //------------------------------------------------

  if (
    !liveRoute.handled
  ) {
          await processUserMessage(
            callId,
            nextTranscript.text,
            signal,
            turnId,
            generationId
          );
  } else {
    log.info(
      {
        event:
          "transcript.processing.workflow_handled",

        turnId,

        responsePresent:
          Boolean(
            liveRoute.response
          ),

        audioQueued:
          liveRoute.audioQueued,

        routeReason:
          liveRoute.reason,
      },
      "Final transcript handled by live business workflow"
    );
  }

          //------------------------------------------------
          // Stale Turn Protection
          //------------------------------------------------

          if (
            !TurnCoordinator.isCurrent(
              callId,
              turnId
            )
          ) {
            log.info(
              {
                event:
                  "transcript.processing.stale_discarded",

                turnId,

                currentTurnId:
                  TurnCoordinator
                    .getCurrentTurnId(
                      callId
                    ),

                characterCount:
                  nextTranscript.text.length,

                fragmentCount:
                  nextTranscript.fragmentCount,

                processingDurationMs:
                  Date.now() -
                  processingStartedAt,

                remainingPending:
                  queue.length,
              },
              "Completed conversation work discarded because a newer turn owns the call"
            );

            continue;
          }

          TurnCoordinator.completeTurn(
            callId,
            turnId
          );

          log.info(
            {
              event:
                "transcript.processing.completed",

              turnId,

              characterCount:
                nextTranscript.text.length,

              fragmentCount:
                nextTranscript.fragmentCount,

              processingDurationMs:
                Date.now() -
                processingStartedAt,

              remainingPending:
                queue.length,
            },
            "Final transcript processing completed"
          );
        } catch (
          error
        ) {
          const aborted =
            error instanceof
              DOMException &&
            error.name ===
              "AbortError";

          const stillCurrent =
            TurnCoordinator.isCurrent(
              callId,
              turnId
            );

          if (
            aborted ||
            !stillCurrent
          ) {
            log.info(
              {
                event:
                  "transcript.processing.cancelled",

                turnId,

                currentTurnId:
                  TurnCoordinator
                    .getCurrentTurnId(
                      callId
                    ),

                characterCount:
                  nextTranscript.text.length,

                fragmentCount:
                  nextTranscript.fragmentCount,

                processingDurationMs:
                  Date.now() -
                  processingStartedAt,

                remainingPending:
                  queue.length,
              },
              "Conversation turn cancelled because it no longer owns the call"
            );

            continue;
          }

          TurnCoordinator.failTurn(
            callId,
            turnId
          );

          log.error(
            {
              event:
                "transcript.processing.failed",

              turnId,

              error:
                normalizeError(
                  error
                ),

              characterCount:
                nextTranscript.text.length,

              fragmentCount:
                nextTranscript.fragmentCount,

              processingDurationMs:
                Date.now() -
                processingStartedAt,

              remainingPending:
                queue.length,
            },
            "Conversation engine failed"
          );
        }
      }
    } finally {
      this.activeTurns.delete(
        callId
      );

      //------------------------------------------
      // Handle Race At Loop Completion
      //------------------------------------------

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
        /*
         * Use the debounce window again. This allows
         * any final fragments arriving at the end of
         * playback to merge before the next turn.
         */
        this.scheduleDrain(
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
