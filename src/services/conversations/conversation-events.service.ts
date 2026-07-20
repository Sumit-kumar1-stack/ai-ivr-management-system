import { EventEmitter } from "events";

import {
  EventPublisher,
  AppEvent,
} from "@/core/events";

export const ConversationEvents =
  new EventEmitter();

ConversationEvents.setMaxListeners(100);

//----------------------------------------
// AI Thinking
//----------------------------------------

ConversationEvents.on(
  "thinking",
  async (callId: string) => {

    await EventPublisher.publish(
      AppEvent.VOICE_THINKING,
      {
        callId,
        status: "AI Thinking",
        timestamp: Date.now(),
      }
    );

  }
);

//----------------------------------------
// AI Listening
//----------------------------------------

ConversationEvents.on(
  "listening",
  async (callId: string) => {

    await EventPublisher.publish(
      AppEvent.VOICE_LISTENING,
      {
        callId,
        status: "Listening",
        timestamp: Date.now(),
      }
    );

  }
);

//----------------------------------------
// AI Speaking
//----------------------------------------

ConversationEvents.on(
  "speaking",
  async (callId: string) => {

    await EventPublisher.publish(
      AppEvent.VOICE_SPEAKING,
      {
        callId,
        status: "AI Speaking",
        timestamp: Date.now(),
      }
    );

  }
);

//----------------------------------------
// AI Interrupted
//----------------------------------------

ConversationEvents.on(
  "interrupted",
  async (callId: string) => {

    await EventPublisher.publish(
      AppEvent.VOICE_INTERRUPTED,
      {
        callId,
        status: "Interrupted",
        timestamp: Date.now(),
      }
    );

  }
);

//----------------------------------------
// Voice Completed
//----------------------------------------

ConversationEvents.on(
  "completed",
  async (callId: string) => {

    await EventPublisher.publish(
      AppEvent.VOICE_COMPLETED,
      {
        callId,
        status: "Completed",
        timestamp: Date.now(),
      }
    );

  }
);