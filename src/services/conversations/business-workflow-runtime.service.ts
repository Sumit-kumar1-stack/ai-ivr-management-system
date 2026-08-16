import {
  getBusinessWorkflowState,
} from "./business-workflow-state.service";

import {
  getCallbackConversation,
} from "./callback-conversation.service";

import {
  getLeadConversation,
} from "./lead-conversation.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface ActiveBusinessWorkflowResult {
  active:
    boolean;

  type:
    "CALLBACK" |
    "LEAD" |
    null;

  stage:
    string |
    null;

  prompt:
    string |
    null;

  needsConfirmation:
    boolean;
}

//--------------------------------------------------
// Resolve Active Workflow
//--------------------------------------------------

export async function resolveActiveBusinessWorkflow(
  callId:
    string
): Promise<ActiveBusinessWorkflowResult> {
  const state =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !state
  ) {
    return {
      active:
        false,

      type:
        null,

      stage:
        null,

      prompt:
        null,

      needsConfirmation:
        false,
    };
  }

  //------------------------------------------------
  // Callback
  //------------------------------------------------

  if (
    state.type ===
      "CALLBACK"
  ) {
    const callback =
      await getCallbackConversation(
        callId
      );

    return {
      active:
        true,

      type:
        "CALLBACK",

      stage:
        state.stage,

      prompt:
        callback?.prompt ??
        null,

      needsConfirmation:
        callback
          ?.needsConfirmation ??
        false,
    };
  }

  //------------------------------------------------
  // Lead
  //------------------------------------------------

  const lead =
    await getLeadConversation(
      callId
    );

  return {
    active:
      true,

    type:
      "LEAD",

    stage:
      state.stage,

    prompt:
      lead?.prompt ??
      null,

    needsConfirmation:
      lead
        ?.needsConfirmation ??
      false,
  };
}