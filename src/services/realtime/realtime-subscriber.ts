import {
  TranscriptEvents,
  TranscriptEvent,
} from "@/services/speech/transcript.events";

import {
  ConversationEvents,
} from "@/services/conversations/conversation-events.service";

import {
  RealtimeService,
} from "./realtime.service";

export class RealtimeSubscriber {

  static register() {

    //----------------------------------
    // Partial transcript
    //----------------------------------

    TranscriptEvents.on(

      TranscriptEvent.PARTIAL,

      (payload) => {

        RealtimeService.transcript(

          payload.callId,

          payload.text

        );

      }

    );

    //----------------------------------
    // Listening
    //----------------------------------

    ConversationEvents.on(

      "listening",

      (callId) => {

        RealtimeService.state(

          callId,

          "LISTENING"

        );

      }

    );

    //----------------------------------
    // Thinking
    //----------------------------------

    ConversationEvents.on(

      "thinking",

      (callId) => {

        RealtimeService.state(

          callId,

          "THINKING"

        );

      }

    );

    //----------------------------------
    // Speaking
    //----------------------------------

    ConversationEvents.on(

      "speaking",

      (callId) => {

        RealtimeService.state(

          callId,

          "SPEAKING"

        );

      }

    );

  }

}