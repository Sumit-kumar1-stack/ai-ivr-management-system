import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  requestLeadCreation,
} from "@/services/tools/create-lead.service";

import {
  clearBusinessWorkflowState,
  getBusinessWorkflowState,
  setBusinessWorkflowStage,
  startLeadWorkflow,
  updateLeadWorkflow,
} from "./business-workflow-state.service";

//--------------------------------------------------
// Update
//--------------------------------------------------

export interface LeadConversationUpdate {
  fullName?:
    string;

  phone?:
    string;

  email?:
    string;

  interest?:
    string;

  notes?:
    string;
}

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface LeadConversationResult {
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

export async function beginLeadConversation(
  callId:
    string,

  initial?:
    LeadConversationUpdate
): Promise<LeadConversationResult> {
  await startLeadWorkflow(
    callId,
    initial
  );

  return buildLeadCollectionResult(
    callId
  );
}

//--------------------------------------------------
// Update
//--------------------------------------------------

export async function updateLeadConversation(
  callId:
    string,

  patch:
    LeadConversationUpdate
): Promise<LeadConversationResult> {
  await updateLeadWorkflow(
    callId,
    patch
  );

  return buildLeadCollectionResult(
    callId
  );
}

//--------------------------------------------------
// Inspect
//--------------------------------------------------

export async function getLeadConversation(
  callId:
    string
): Promise<LeadConversationResult | null> {
  const state =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !state ||
    state.type !==
      "LEAD"
  ) {
    return null;
  }

  return buildLeadCollectionResult(
    callId
  );
}

//--------------------------------------------------
// Confirm
//--------------------------------------------------

export async function confirmLeadConversation(
  callId:
    string,

  confirmed:
    boolean,

  signal?:
    AbortSignal
): Promise<LeadConversationResult> {
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
      "LEAD"
  ) {
    return {
      handled:
        false,

      completed:
        false,

      needsConfirmation:
        false,

      prompt:
        "There is no lead request waiting for confirmation.",

      missingFields:
        [],
    };
  }

  //------------------------------------------------
  // Reject
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
        "Okay. I will not save those details.",

      missingFields:
        [],
    };
  }

  const lead =
    state.lead ??
    {};

  const missing =
    getMissingLeadFields(
      lead
    );

  if (
    missing.length >
    0
  ) {
    return buildLeadCollectionResult(
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
      await requestLeadCreation({
        callId,

        fullName:
          lead.fullName,

        phone:
          lead.phone,

        email:
          lead.email,

        interest:
          lead.interest!,

        notes:
          lead.notes,

        confirmed:
          true,

        requestedBy:
          "AI",

        idempotencyKey:
          `lead:${callId}:${state.id}`,

        signal,
      });

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
          "I could not save your request right now. Would you like me to try again?",

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
          "conversation.lead.completed",
      },
      "Conversational lead workflow completed"
    );

    return {
      handled:
        true,

      completed:
        true,

      needsConfirmation:
        false,

      prompt:
        "Thank you. Your details have been saved for follow-up.",

      missingFields:
        [],
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "conversation.lead.failed",

        error:
          normalizeError(
            error
          ),
      },
      "Conversational lead workflow failed"
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
        "I could not save your request right now. Would you like me to try again?",

      missingFields:
        [],
    };
  }
}

//--------------------------------------------------
// Build Collection Result
//--------------------------------------------------

async function buildLeadCollectionResult(
  callId:
    string
): Promise<LeadConversationResult> {
  const state =
    await getBusinessWorkflowState(
      callId
    );

  if (
    !state ||
    state.type !==
      "LEAD"
  ) {
    return {
      handled:
        false,

      completed:
        false,

      needsConfirmation:
        false,

      prompt:
        "There is no active lead request.",

      missingFields:
        [],
    };
  }

  const lead =
    state.lead ??
    {};

  const missing =
    getMissingLeadFields(
      lead
    );

  //------------------------------------------------
  // Interest
  //------------------------------------------------

  if (
    missing.includes(
      "interest"
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
        "What product or service are you interested in?",

      missingFields:
        missing,
    };
  }

  //------------------------------------------------
  // Contact Method
  //------------------------------------------------

  if (
    missing.includes(
      "contact"
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
        "Please provide either a phone number or an email address so our team can contact you.",

      missingFields:
        missing,
    };
  }

  //------------------------------------------------
  // Confirmation
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
      buildLeadConfirmationPrompt(
        lead
      ),

    missingFields:
      [],
  };
}

//--------------------------------------------------
// Missing
//--------------------------------------------------

function getMissingLeadFields(
  lead: {
    phone?:
      string;

    email?:
      string;

    interest?:
      string;
  }
): string[] {
  const missing:
    string[] =
    [];

  if (
    !lead.interest
      ?.trim()
  ) {
    missing.push(
      "interest"
    );
  }

  if (
    !lead.phone
      ?.trim() &&
    !lead.email
      ?.trim()
  ) {
    missing.push(
      "contact"
    );
  }

  return missing;
}

//--------------------------------------------------
// Confirmation
//--------------------------------------------------

function buildLeadConfirmationPrompt(
  lead:
    LeadConversationUpdate
): string {
  const contact =
    lead.phone
      ?.trim() ||
    lead.email
      ?.trim() ||
    "the provided contact information";

  return (
    `To confirm, you are interested in ${lead.interest} ` +
    `and you would like our team to follow up using ${contact}. ` +
    `May I save these details?`
  );
}