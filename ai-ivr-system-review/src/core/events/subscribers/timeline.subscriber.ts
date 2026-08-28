import {
  AppEvent,
  EventSubscriber,
} from "@/core/events";

import {
  CallPayload,
} from "@/core/events/payloads/call.payload";

import {
  createCallLogger,
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  CallTimelineService,
} from "@/services/calls/call-timeline.service";

import {
  runPostCallProcessing,
} from "@/services/conversations/conversation-engine.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "timeline-subscriber"
  );

//--------------------------------------------------
// Post-Processing Locks
//--------------------------------------------------

/*
 * Prevent duplicate provider callbacks from
 * starting post-call processing more than once
 * in the current process.
 */
const postProcessingCalls =
  new Set<string>();

/*
 * Keep completed-call locks for a short period
 * because providers may repeat terminal callbacks.
 */
const POST_PROCESS_LOCK_MS =
  5 * 60 * 1000;

//--------------------------------------------------
// Timeline Subscriber
//--------------------------------------------------

export class TimelineSubscriber {
  private static registered =
    false;

  //------------------------------------------------
  // Register
  //------------------------------------------------

  static register():
    void {
    if (
      this.registered
    ) {
      serviceLog.debug(
        {
          event:
            "timeline.subscriber.registration_skipped",

          reason:
            "already_registered",
        },
        "Timeline subscriber is already registered"
      );

      return;
    }

    this.registered =
      true;

    serviceLog.info(
      {
        event:
          "timeline.subscriber.registered",
      },
      "Timeline subscriber registered"
    );

    //----------------------------------------------
    // Call Started
    //----------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_STARTED,
      async payload => {
        await CallTimelineService.started(
          payload.callId
        );
      }
    );

    //----------------------------------------------
    // Call Ringing
    //----------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_RINGING,
      async payload => {
        await CallTimelineService.ringing(
          payload.callId
        );
      }
    );

    //----------------------------------------------
    // Call Answered
    //----------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_ANSWERED,
      async payload => {
        await CallTimelineService.answered(
          payload.callId
        );
      }
    );

    //----------------------------------------------
    // Voice Thinking
    //----------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.VOICE_THINKING,
      async payload => {
        await CallTimelineService.thinking(
          payload.callId
        );
      }
    );

    //----------------------------------------------
    // Voice Listening
    //----------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.VOICE_LISTENING,
      async payload => {
        await CallTimelineService.listening(
          payload.callId
        );
      }
    );

    //----------------------------------------------
    // Voice Interrupted
    //----------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.VOICE_INTERRUPTED,
      async payload => {
        await CallTimelineService.interrupted(
          payload.callId
        );
      }
    );

    //----------------------------------------------
    // Call Completed
    //----------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_COMPLETED,
      async payload => {
        const callId =
          payload.callId;

        const log =
          createCallLogger(
            callId
          );

        //------------------------------------------
        // Save Timeline Completion
        //------------------------------------------

        try {
          await CallTimelineService.completed(
            callId
          );
        } catch (
          error
        ) {
          log.error(
            {
              event:
                "timeline.call_completion.failed",

              error:
                normalizeError(
                  error
                ),
            },
            "Failed to save completed call timeline event"
          );
        }

        //------------------------------------------
        // Prevent Duplicate Post-Call Processing
        //------------------------------------------

        if (
          postProcessingCalls.has(
            callId
          )
        ) {
          log.debug(
            {
              event:
                "timeline.post_call_processing.skipped",

              reason:
                "processing_lock_active",
            },
            "Duplicate post-call processing skipped"
          );

          return;
        }

        postProcessingCalls.add(
          callId
        );

        log.info(
          {
            event:
              "timeline.post_call_processing.started",
          },
          "Post-call processing started"
        );

        //------------------------------------------
        // Run Durable Final Processing
        //------------------------------------------

        try {
          /*
           * This must run even when per-turn analysis
           * is enabled.
           *
           * Per-turn analysis supports live dashboard
           * updates, while post-call processing saves
           * the final transcript and durable summary.
           */
          await runPostCallProcessing(
            callId
          );

          log.info(
            {
              event:
                "timeline.post_call_processing.completed",
            },
            "Post-call processing completed"
          );
        } catch (
          error
        ) {
          log.error(
            {
              event:
                "timeline.post_call_processing.failed",

              error:
                normalizeError(
                  error
                ),
            },
            "Post-call processing failed"
          );
        } finally {
          /*
           * Keep the lock temporarily because Twilio
           * may send repeated completed callbacks.
           *
           * The durable idempotency check inside
           * runPostCallProcessing() provides another
           * protection layer.
           */
          const timer =
            setTimeout(
              () => {
                postProcessingCalls.delete(
                  callId
                );
              },
              POST_PROCESS_LOCK_MS
            );

          /*
           * Do not keep Node.js alive only because
           * this cleanup timer is pending.
           */
          timer.unref?.();
        }
      }
    );

    //----------------------------------------------
    // Call Failed
    //----------------------------------------------

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_FAILED,
      async payload => {
        const callId =
          payload.callId;

        const log =
          createCallLogger(
            callId
          );

        /*
         * There may still be a partial conversation
         * for failed calls that connected before the
         * failure occurred.
         *
         * Do not run post-call processing here yet,
         * because failed outbound attempts may be
         * retried by the call service.
         */
        log.info(
          {
            event:
              "timeline.call_failed.received",
          },
          "Failed call lifecycle event received"
        );
      }
    );
  }
}