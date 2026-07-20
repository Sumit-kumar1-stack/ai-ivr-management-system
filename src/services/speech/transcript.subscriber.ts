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

export class TranscriptSubscriber {

  private static registered = false;

  static register() {

    if (this.registered) {

      console.log(
        "⚠️ TranscriptSubscriber already registered"
      );

      return;

    }

    this.registered = true;

    console.log(
      "✅ TranscriptSubscriber Registered"
    );

    TranscriptEvents.on(

      TranscriptEvent.FINAL,

      async (payload) => {

        const log =
          createCallLogger(
            payload.callId
          );

        console.log(
          "🔥 FINAL EVENT RECEIVED"
        );

        console.log(
          payload
        );

        log.info(

          {
            transcript:
              payload.text,
          },

          "Final transcript received"

        );

        try {

          await processUserMessage(

            payload.callId,

            payload.text

          );

        }

        catch (error) {

          log.error(

            { error },

            "Conversation engine failed"

          );

        }

      }

    );

  }

}