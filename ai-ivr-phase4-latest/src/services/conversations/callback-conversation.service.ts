import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  executeConfirmedCallback,
} from "@/services/ivr/ivr-action-executor.service";

import {
  clearBusinessWorkflowState,
  getBusinessWorkflowState,
  setBusinessWorkflowStage,
  startCallbackWorkflow,
  updateCallbackWorkflow,
} from "./business-workflow-state.service";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface CallbackConversationUpdate {
  phone?:
    string;

  scheduledFor?:
    string;

  timezone?:
    string;

  reason?:
    string;
}

//--------------------------------------------------
// Response
//--------------------------------------------------

export interface CallbackConversationResult {
  handled:
    boolean;

  completed:
    boolean;

  needsConfirmation:
    boolean;

  prompt:
    string;

  missingFields:
    string[];
}

//--------------------------------------------------
// Start
//--------------------------------------------------

export async function beginCallbackConversation(
  callId:
    string,

  initial?:
    CallbackConversationUpdate
): Promise<CallbackConversationResult> {
  await startCallbackWorkflow(
    callId,
    initial
  );

  return buildCallbackCollectionResult(
    callId
  );
}

//--------------------------------------------------
// Update
//--------------------------------------------------

export async function updateCallbackConversation(
  callId:
    string,

  patch:
    CallbackConversationUpdate
): Promise<CallbackConversationResult> {
  await updateCallbackWorkflow(
    callId,
    patch
  );

  return buildCallbackCollectionResult(
    callId
  );
}

//--------------------------------------------------
// Inspect
//--------------------------------------------------

export async function getCallbackConversation(
  callId:
    string
): Promise<CallbackConversationResult | null> {
  const state =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !state ||
    state.type !==
      "CALLBACK"
  ) {
    return null;
  }

  return buildCallbackCollectionResult(
    callId
  );
}

//--------------------------------------------------
// Confirm And Execute
//--------------------------------------------------

export async function confirmCallbackConversation(
  callId:
    string,

  confirmed:
    boolean,

  signal?:
    AbortSignal
): Promise<CallbackConversationResult> {
  const log =
    createCallLogger(
      callId
    );

  const state =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !state ||
    state.type !==
      "CALLBACK"
  ) {
    return {
      handled:
        false,

      completed:
        false,

      needsConfirmation:
        false,

      prompt:
        "There is no callback request waiting for confirmation.",

      missingFields:
        [],
    };
  }

  //------------------------------------------------
  // Customer Rejected
  //------------------------------------------------

  if (
    !confirmed
  ) {
    await clearBusinessWorkflowState(
      callId
    );

    return {
      handled:
        true,

      completed:
        false,

      needsConfirmation:
        false,

      prompt:
        "Okay. I have cancelled the callback request.",

      missingFields:
        [],
    };
  }

  const callback =
    state.callback ??
    {};

  const missingFields =
    getMissingCallbackFields(
      callback
    );

  if (
    missingFields.length >
    0
  ) {
    return buildCallbackCollectionResult(
      callId
    );
  }

  //------------------------------------------------
  // Execute
  //------------------------------------------------

  await setBusinessWorkflowStage(
    callId,
    "EXECUTING"
  );

  try {
    const result =
      await executeConfirmedCallback(
        callId,
        {
          phone:
            callback.phone!,

          scheduledFor:
            callback.scheduledFor!,

          timezone:
            callback.timezone!,

          reason:
            callback.reason,

          requestedBy:
            "AI",

          idempotencyKey:
            `callback:${callId}:${state.id}`,

          signal,
        }
      );

    if (
      !result.success
    ) {
      await setBusinessWorkflowStage(
        callId,
        "AWAITING_CONFIRMATION"
      );

      return {
        handled:
          true,

        completed:
          false,

        needsConfirmation:
          true,

        prompt:
          "I could not schedule the callback right now. Would you like me to try again?",

        missingFields:
          [],
      };
    }

    //------------------------------------------------
    // Complete
    //------------------------------------------------

    await setBusinessWorkflowStage(
      callId,
      "COMPLETED"
    );

    await clearBusinessWorkflowState(
      callId
    );

    log.info(
      {
        event:
          "conversation.callback.completed",
      },
      "Conversational callback workflow completed"
    );

    return {
      handled:
        true,

      completed:
        true,

      needsConfirmation:
        false,

      prompt:
        "Your callback has been scheduled successfully.",

      missingFields:
        [],
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "conversation.callback.failed",

        error:
          normalizeError(
            error
          ),
      },
      "Conversational callback workflow failed"
    );

    await setBusinessWorkflowStage(
      callId,
      "AWAITING_CONFIRMATION"
    );

    return {
      handled:
        true,

      completed:
        false,

      needsConfirmation:
        true,

      prompt:
        "I could not schedule the callback right now. Would you like me to try again?",

      missingFields:
        [],
    };
  }
}

//--------------------------------------------------
// Collection Result
//--------------------------------------------------

async function buildCallbackCollectionResult(
  callId:
    string
): Promise<CallbackConversationResult> {
  const state =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !state ||
    state.type !==
      "CALLBACK"
  ) {
    return {
      handled:
        false,

      completed:
        false,

      needsConfirmation:
        false,

      prompt:
        "There is no active callback request.",

      missingFields:
        [],
    };
  }

  const callback =
    state.callback ??
    {};

  const missingFields =
    getMissingCallbackFields(
      callback
    );

  //------------------------------------------------
  // Need Phone
  //------------------------------------------------

  if (
    missingFields.includes(
      "phone"
    )
  ) {
    return {
      handled:
        true,

      completed:
        false,

      needsConfirmation:
        false,

      prompt:
        "What phone number should we use for the callback?",

      missingFields,
    };
  }

  //------------------------------------------------
  // Need Time
  //------------------------------------------------

  if (
    missingFields.includes(
      "scheduledFor"
    )
  ) {
    return {
      handled:
        true,

      completed:
        false,

      needsConfirmation:
        false,

      prompt:
        "What date and time would you like us to call you back?",

      missingFields,
    };
  }

  //------------------------------------------------
  // Need Timezone
  //------------------------------------------------

  if (
    missingFields.includes(
      "timezone"
    )
  ) {
    return {
      handled:
        true,

      completed:
        false,

      needsConfirmation:
        false,

      prompt:
        "Which timezone should I use for that callback time?",

      missingFields,
    };
  }

  //------------------------------------------------
  // Ready For Confirmation
  //------------------------------------------------

  if (
    state.stage !==
      "AWAITING_CONFIRMATION"
  ) {
    await setBusinessWorkflowStage(
      callId,
      "AWAITING_CONFIRMATION"
    );
  }

  return {
    handled:
      true,

    completed:
      false,

    needsConfirmation:
      true,

    prompt:
      buildCallbackConfirmationPrompt(
        callback.phone!,
        callback.scheduledFor!,
        callback.timezone!
      ),

    missingFields:
      [],
  };
}

//--------------------------------------------------
// Missing Fields
//--------------------------------------------------

function getMissingCallbackFields(
  callback: {
    phone?:
      string;

    scheduledFor?:
      string;

    timezone?:
      string;
  }
): string[] {
  const fields:
    string[] =
    [];

  if (
    !callback.phone
      ?.trim()
  ) {
    fields.push(
      "phone"
    );
  }

  if (
    !callback.scheduledFor
      ?.trim()
  ) {
    fields.push(
      "scheduledFor"
    );
  }

  if (
    !callback.timezone
      ?.trim()
  ) {
    fields.push(
      "timezone"
    );
  }

  return fields;
}

//--------------------------------------------------
// Confirmation Prompt
//--------------------------------------------------

function buildCallbackConfirmationPrompt(
  phone:
    string,

  scheduledFor:
    string,

  timezone:
    string
): string {
  return (
    `To confirm, you would like a callback on ${phone} ` +
    `at ${scheduledFor} using timezone ${timezone}. Is that correct?`
  );
}