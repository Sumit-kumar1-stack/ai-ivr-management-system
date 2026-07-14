export type ConversationState =
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "ENDED";

const stateMap = new Map<
  string,
  ConversationState
>();

export const ConversationStateService = {
  setState(
    callId: string,
    state: ConversationState
  ) {
    stateMap.set(callId, state);

    console.log(
      `📍 ${callId} -> ${state}`
    );
  },

  getState(
    callId: string
  ): ConversationState {
    return (
      stateMap.get(callId) ??
      "IDLE"
    );
  },

  clearState(
    callId: string
  ) {
    stateMap.delete(callId);
  },
};