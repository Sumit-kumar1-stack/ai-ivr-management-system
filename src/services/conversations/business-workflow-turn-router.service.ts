import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  cancelBusinessWorkflow,
  getBusinessWorkflowState,
} from "./business-workflow-state.service";

import {
  confirmCallbackConversation,
  updateCallbackConversation,
} from "./callback-conversation.service";

import {
  confirmLeadConversation,
  updateLeadConversation,
} from "./lead-conversation.service";

import {
  detectConfirmationIntent,
  extractCallbackDateTimeFromTurn,
  extractEmailFromTurn,
  extractInterestFromTurn,
  extractNameFromTurn,
  extractPhoneFromTurn,
  extractTimezoneFromTurn,
} from "./business-workflow-input.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface BusinessWorkflowTurnResult {
  handled:
    boolean;

  completed:
    boolean;

  shouldContinueNormalConversation:
    boolean;

  workflowType:
    "CALLBACK" |
    "LEAD" |
    null;

  response:
    string | null;
}

//--------------------------------------------------
// Route Turn
//--------------------------------------------------

export async function routeBusinessWorkflowTurn(
  callId:
    string,

  transcript:
    string,

  signal?:
    AbortSignal
): Promise<BusinessWorkflowTurnResult> {
  const text =
    transcript.trim();

  if (
    !text
  ) {
    return normalConversation();
  }

  const state =
    await getBusinessWorkflowState(
      callId
    );

  //------------------------------------------------
  // No Business Workflow
  //------------------------------------------------

  if (
    !state
  ) {
    return normalConversation();
  }

  const log =
    createCallLogger(
      callId
    );

  try {
    //------------------------------------------------
    // Global Cancellation
    //------------------------------------------------

    const confirmationIntent =
      detectConfirmationIntent(
        text
      );

    if (
      confirmationIntent ===
      "CANCEL"
    ) {
      await cancelBusinessWorkflow(
        callId
      );

      log.info(
        {
          event:
            "business_workflow.cancelled",

          workflowType:
            state.type,
        },
        "Business workflow cancelled by customer"
      );

      return {
        handled:
          true,

        completed:
          false,

        shouldContinueNormalConversation:
          false,

        workflowType:
          state.type,

        response:
          state.type ===
            "CALLBACK"
            ? "Okay. I have cancelled the callback request."
            : "Okay. I will not save those details.",
      };
    }

    //------------------------------------------------
    // Callback
    //------------------------------------------------

    if (
      state.type ===
      "CALLBACK"
    ) {
      return routeCallbackTurn(
        callId,
        text,
        state.stage,
        signal
      );
    }

    //------------------------------------------------
    // Lead
    //------------------------------------------------

    return routeLeadTurn(
      callId,
      text,
      state.stage,
      signal
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "business_workflow.turn_failed",

        workflowType:
          state.type,

        stage:
          state.stage,

        error:
          normalizeError(
            error
          ),
      },
      "Business workflow turn processing failed"
    );

    return {
      handled:
        true,

      completed:
        false,

      shouldContinueNormalConversation:
        false,

      workflowType:
        state.type,

      response:
        "I couldn't process that detail. Could you please say it again?",
    };
  }
}

//--------------------------------------------------
// Callback Router
//--------------------------------------------------

async function routeCallbackTurn(
  callId:
    string,

  text:
    string,

  stage:
    string,

  signal?:
    AbortSignal
): Promise<BusinessWorkflowTurnResult> {
  //------------------------------------------------
  // Confirmation
  //------------------------------------------------

  if (
    stage ===
    "AWAITING_CONFIRMATION"
  ) {
    const intent =
      detectConfirmationIntent(
        text
      );

    if (
      intent ===
      "CONFIRM"
    ) {
      const result =
        await confirmCallbackConversation(
          callId,
          true,
          signal
        );

      return workflowResponse(
        "CALLBACK",
        result.completed,
        result.prompt
      );
    }

    if (
      intent ===
        "REJECT" ||
      intent ===
        "CANCEL"
    ) {
      const result =
        await confirmCallbackConversation(
          callId,
          false,
          signal
        );

      return workflowResponse(
        "CALLBACK",
        false,
        result.prompt
      );
    }

    return workflowResponse(
      "CALLBACK",
      false,
      "Please say yes to confirm the callback, or no to cancel it."
    );
  }

  //------------------------------------------------
  // Load Current Data
  //------------------------------------------------

  const state =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !state ||
    state.type !==
      "CALLBACK"
  ) {
    return normalConversation();
  }

  const callback =
    state.callback ??
    {};

  //------------------------------------------------
  // Phone
  //------------------------------------------------

  if (
    !callback.phone
      ?.trim()
  ) {
    const phone =
      extractPhoneFromTurn(
        text
      );

    if (
      !phone
    ) {
      return workflowResponse(
        "CALLBACK",
        false,
        "I couldn't recognize that phone number. Please say the number including the country code, or a 10-digit Indian mobile number."
      );
    }

    const result =
      await updateCallbackConversation(
        callId,
        {
          phone,
        }
      );

    return workflowResponse(
      "CALLBACK",
      result.completed,
      result.prompt
    );
  }

  //------------------------------------------------
  // Timezone
  //------------------------------------------------

  /*
   * We can use an explicitly spoken timezone.
   *
   * If none has been stored yet, India is allowed
   * as a server-configured default for this current
   * deployment, but it remains configurable.
   */

let timezone:
  string |
  undefined =
    callback.timezone
      ?.trim() ||
    undefined;

if (
  !timezone
) {
  timezone =
    extractTimezoneFromTurn(
      text
    ) ??
    getDefaultCallbackTimezone() ??
    undefined;

  if (
    timezone
  ) {
    await updateCallbackConversation(
      callId,
      {
        timezone,
      }
    );
  }
}
  //------------------------------------------------
  // Scheduled Time
  //------------------------------------------------

  if (
    !callback.scheduledFor
      ?.trim()
  ) {
    if (
      !timezone
    ) {
      const suppliedTimezone =
        extractTimezoneFromTurn(
          text
        );

      if (
        suppliedTimezone
      ) {
        const result =
          await updateCallbackConversation(
            callId,
            {
              timezone:
                suppliedTimezone,
            }
          );

        return workflowResponse(
          "CALLBACK",
          result.completed,
          result.prompt
        );
      }

      return workflowResponse(
        "CALLBACK",
        false,
        "Which timezone should I use for your callback?"
      );
    }

    const scheduledFor =
      extractCallbackDateTimeFromTurn(
        text,
        timezone
      );

    if (
      !scheduledFor
    ) {
      return workflowResponse(
        "CALLBACK",
        false,
        "Please tell me a clear callback time, for example, tomorrow at 3 PM."
      );
    }

    const result =
      await updateCallbackConversation(
        callId,
        {
          scheduledFor,

          timezone,
        }
      );

    return workflowResponse(
      "CALLBACK",
      result.completed,
      result.prompt
    );
  }

  //------------------------------------------------
  // Explicit Timezone Still Missing
  //------------------------------------------------

  if (
    !callback.timezone
      ?.trim() &&
    !timezone
  ) {
    const suppliedTimezone =
      extractTimezoneFromTurn(
        text
      );

    if (
      !suppliedTimezone
    ) {
      return workflowResponse(
        "CALLBACK",
        false,
        "Which timezone should I use for that callback time?"
      );
    }

    const result =
      await updateCallbackConversation(
        callId,
        {
          timezone:
            suppliedTimezone,
        }
      );

    return workflowResponse(
      "CALLBACK",
      result.completed,
      result.prompt
    );
  }

  //------------------------------------------------
  // Refresh Workflow Prompt
  //------------------------------------------------

  const result =
    await updateCallbackConversation(
      callId,
      {}
    );

  return workflowResponse(
    "CALLBACK",
    result.completed,
    result.prompt
  );
}

//--------------------------------------------------
// Lead Router
//--------------------------------------------------

async function routeLeadTurn(
  callId:
    string,

  text:
    string,

  stage:
    string,

  signal?:
    AbortSignal
): Promise<BusinessWorkflowTurnResult> {
  //------------------------------------------------
  // Confirmation
  //------------------------------------------------

  if (
    stage ===
    "AWAITING_CONFIRMATION"
  ) {
    const intent =
      detectConfirmationIntent(
        text
      );

    if (
      intent ===
      "CONFIRM"
    ) {
      const result =
        await confirmLeadConversation(
          callId,
          true,
          signal
        );

      return workflowResponse(
        "LEAD",
        result.completed,
        result.prompt
      );
    }

    if (
      intent ===
        "REJECT" ||
      intent ===
        "CANCEL"
    ) {
      const result =
        await confirmLeadConversation(
          callId,
          false,
          signal
        );

      return workflowResponse(
        "LEAD",
        false,
        result.prompt
      );
    }

    return workflowResponse(
      "LEAD",
      false,
      "Please say yes if I may save these details, or no if you do not want them saved."
    );
  }

  //------------------------------------------------
  // Current State
  //------------------------------------------------

  const state =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !state ||
    state.type !==
      "LEAD"
  ) {
    return normalConversation();
  }

  const lead =
    state.lead ??
    {};

  //------------------------------------------------
  // Interest
  //------------------------------------------------

  if (
    !lead.interest
      ?.trim()
  ) {
    const interest =
      extractInterestFromTurn(
        text
      );

    if (
      !interest
    ) {
      return workflowResponse(
        "LEAD",
        false,
        "What product or service are you interested in?"
      );
    }

    const result =
      await updateLeadConversation(
        callId,
        {
          interest,
        }
      );

    return workflowResponse(
      "LEAD",
      result.completed,
      result.prompt
    );
  }

  //------------------------------------------------
  // Contact
  //------------------------------------------------

  if (
    !lead.phone
      ?.trim() &&
    !lead.email
      ?.trim()
  ) {
    const phone =
      extractPhoneFromTurn(
        text
      );

    const email =
      extractEmailFromTurn(
        text
      );

    if (
      !phone &&
      !email
    ) {
      return workflowResponse(
        "LEAD",
        false,
        "Please provide either a phone number or an email address for the follow-up."
      );
    }

    const result =
      await updateLeadConversation(
        callId,
        {
          phone:
            phone ??
            undefined,

          email:
            email ??
            undefined,
        }
      );

    return workflowResponse(
      "LEAD",
      result.completed,
      result.prompt
    );
  }

  //------------------------------------------------
  // Optional Name
  //------------------------------------------------

  if (
    !lead.fullName
      ?.trim()
  ) {
    const fullName =
      extractNameFromTurn(
        text
      );

    if (
      fullName
    ) {
      const result =
        await updateLeadConversation(
          callId,
          {
            fullName,
          }
        );

      return workflowResponse(
        "LEAD",
        result.completed,
        result.prompt
      );
    }
  }

  //------------------------------------------------
  // Ready
  //------------------------------------------------

  const result =
    await updateLeadConversation(
      callId,
      {}
    );

  return workflowResponse(
    "LEAD",
    result.completed,
    result.prompt
  );
}

//--------------------------------------------------
// Workflow Response
//--------------------------------------------------

function workflowResponse(
  workflowType:
    "CALLBACK" |
    "LEAD",

  completed:
    boolean,

  response:
    string
): BusinessWorkflowTurnResult {
  return {
    handled:
      true,

    completed,

    shouldContinueNormalConversation:
      false,

    workflowType,

    response,
  };
}

//--------------------------------------------------
// Normal Conversation
//--------------------------------------------------

function normalConversation():
  BusinessWorkflowTurnResult {
  return {
    handled:
      false,

    completed:
      false,

    shouldContinueNormalConversation:
      true,

    workflowType:
      null,

    response:
      null,
  };
}

//--------------------------------------------------
// Default Callback Timezone
//--------------------------------------------------

function getDefaultCallbackTimezone():
  string | null {
  const configured =
    process.env
      .DEFAULT_CALLBACK_TIMEZONE
      ?.trim();

  if (
    configured
  ) {
    try {
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone:
            configured,
        }
      );

      return configured;
    } catch {
      return null;
    }
  }

  return "Asia/Kolkata";
}