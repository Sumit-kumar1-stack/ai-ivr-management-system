import {
  EventSubscriber,
  AppEvent,
} from "@/core/events";

import {
  CallPayload,
} from "@/core/events/payloads/call.payload";

import {
  CallTimelineService,
} from "@/services/calls/call-timeline.service";

export class TimelineSubscriber {

  static register() {

    EventSubscriber.on<CallPayload>(

      AppEvent.CALL_STARTED,

      async payload => {

        await CallTimelineService.started(
          payload.callId
        );

      }

    );

    EventSubscriber.on<CallPayload>(

      AppEvent.VOICE_INTERRUPTED,

      async payload => {

        await CallTimelineService.interrupted(

          payload.callId

        );

      }

    );

    EventSubscriber.on<CallPayload>(

      AppEvent.CALL_RINGING,

      async payload => {

        await CallTimelineService.ringing(
          payload.callId
        );

      }

    );

    EventSubscriber.on<CallPayload>(

      AppEvent.CALL_ANSWERED,

      async payload => {

        await CallTimelineService.answered(
          payload.callId
        );

      }

    );

    EventSubscriber.on<CallPayload>(

      AppEvent.CALL_COMPLETED,

      async payload => {

        await CallTimelineService.completed(
          payload.callId
        );

      }

    );

    EventSubscriber.on<CallPayload>(

      AppEvent.VOICE_THINKING,

      async payload => {

        await CallTimelineService.thinking(
          payload.callId
        );

      }

    );

    EventSubscriber.on<CallPayload>(

      AppEvent.VOICE_LISTENING,

      async payload => {

        await CallTimelineService.listening(
          payload.callId
        );

      }

    );

  }

}