import {
  AppEvent,
  EventSubscriber,
} from "@/core/events";

import {
  CallPayload,
} from "@/core/events/payloads/call.payload";

import {
  CallTimelineService,
} from "@/services/calls/call-timeline.service";

import {
  runPostCallProcessing,
} from "@/services/conversations/conversation-engine.service";

const postProcessedCalls =
  new Set<string>();

export class TimelineSubscriber {
  private static registered =
    false;

  static register(): void {
    if (
      this.registered
    ) {
      console.log(
        "⚠️ TimelineSubscriber already registered"
      );

      return;
    }

    this.registered =
      true;

    console.log(
      "✅ TimelineSubscriber Registered"
    );

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_STARTED,
      async (payload) => {
        await CallTimelineService.started(
          payload.callId
        );
      }
    );

    EventSubscriber.on<CallPayload>(
      AppEvent.VOICE_INTERRUPTED,
      async (payload) => {
        await CallTimelineService.interrupted(
          payload.callId
        );
      }
    );

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_RINGING,
      async (payload) => {
        await CallTimelineService.ringing(
          payload.callId
        );
      }
    );

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_ANSWERED,
      async (payload) => {
        await CallTimelineService.answered(
          payload.callId
        );
      }
    );

    EventSubscriber.on<CallPayload>(
      AppEvent.CALL_COMPLETED,
      async (payload) => {
        await CallTimelineService.completed(
          payload.callId
        );

        const enablePostTurn =
          process.env
            .ENABLE_POST_TURN_ANALYSIS !==
          "false";

        /*
         * When per-turn analysis is disabled,
         * run analysis once after completion.
         */
        if (
          !enablePostTurn &&
          !postProcessedCalls.has(
            payload.callId
          )
        ) {
          postProcessedCalls.add(
            payload.callId
          );

          try {
            await runPostCallProcessing(
              payload.callId
            );
          } catch (error) {
            console.error(
              "Post-call processing failed",
              {
                callId:
                  payload.callId,

                error:
                  error instanceof Error
                    ? error.message
                    : String(
                        error
                      ),
              }
            );
          } finally {
            /*
             * Keep the lock temporarily because
             * providers may repeat completed
             * callbacks within a short period.
             */
            setTimeout(
              () => {
                postProcessedCalls.delete(
                  payload.callId
                );
              },
              5 * 60 * 1000
            );
          }
        }
      }
    );

    EventSubscriber.on<CallPayload>(
      AppEvent.VOICE_THINKING,
      async (payload) => {
        await CallTimelineService.thinking(
          payload.callId
        );
      }
    );

    EventSubscriber.on<CallPayload>(
      AppEvent.VOICE_LISTENING,
      async (payload) => {
        await CallTimelineService.listening(
          payload.callId
        );
      }
    );
  }
}