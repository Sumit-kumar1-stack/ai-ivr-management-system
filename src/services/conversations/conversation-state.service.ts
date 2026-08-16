import {
  createCallLogger,
} from "@/lib/logger";

//--------------------------------------------------
// Types
//--------------------------------------------------

export type ConversationState =
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "INTERRUPTING"
  | "INTERRUPTED"
  | "ENDED";

//--------------------------------------------------
// State Storage
//--------------------------------------------------

const stateMap =
  new Map<
    string,
    ConversationState
  >();

//--------------------------------------------------
// Conversation State Service
//--------------------------------------------------

export const ConversationStateService =
  {
    setState(
      callId: string,
      state: ConversationState
    ): void {
      const previousState =
        stateMap.get(
          callId
        ) ??
        "IDLE";

      stateMap.set(
        callId,
        state
      );

      const log =
        createCallLogger(
          callId
        );

      log.debug(
        {
          event:
            "conversation.state.changed",

          previousState,

          currentState:
            state,
        },
        "Conversation state changed"
      );
    },

    getState(
      callId: string
    ): ConversationState {
      return (
        stateMap.get(
          callId
        ) ??
        "IDLE"
      );
    },

    clearState(
      callId: string
    ): void {
      const previousState =
        stateMap.get(
          callId
        ) ??
        "IDLE";

      stateMap.delete(
        callId
      );

      const log =
        createCallLogger(
          callId
        );

      log.debug(
        {
          event:
            "conversation.state.cleared",

          previousState,
        },
        "Conversation state cleared"
      );
    },
  };