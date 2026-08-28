import type {
  FunctionDeclaration,
} from "@google/genai";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  requestCallback,
} from "@/services/tools/book-callback.service";

import {
  requestLeadCreation,
} from "@/services/tools/create-lead.service";

import {
  requestEndCall,
} from "@/services/tools/end-call.service";

import {
  requestConsentRecord,
} from "@/services/tools/record-consent.service";

import {
  requestKnowledgeSearch,
} from "@/services/tools/search-knowledge-base.service";

import {
  requestSms,
} from "@/services/tools/send-sms.service";

import {
  requestWhatsApp,
} from "@/services/tools/send-whatsapp.service";

import {
  requestHumanTransfer,
} from "@/services/tools/transfer-to-human.service";

import {
  resolveHumanTransferPolicy,
} from "@/services/telephony/human-transfer-policy.service";

import type {
  ApprovedMessageTemplateKey,
  MessageTemplateVariables,
} from "@/services/messaging/message-template.service";

import type {
  ApprovedWhatsAppTemplateKey,
  WhatsAppTemplateVariables,
} from "@/services/messaging/whatsapp-template.service";

import {
  GeminiLiveActionConfirmationService,
} from "./gemini-live-action-confirmation.service";

import type {
  GeminiLiveBusinessActionName,
  GeminiLivePendingAction,
} from "./gemini-live-action-confirmation.service";

//--------------------------------------------------
// Gemini Live Function Call
//--------------------------------------------------

export interface GeminiLiveFunctionCall {
  id?:
    string;

  name?:
    string;

  args?:
    Record<
      string,
      unknown
    >;
}

//--------------------------------------------------
// Gemini Live Function Response
//--------------------------------------------------

export interface GeminiLiveFunctionResponse {
  id?:
    string;

  name:
    string;

  response:
    Record<
      string,
      unknown
    >;
}

//--------------------------------------------------
// Supported Messaging Templates
//--------------------------------------------------

const SMS_TEMPLATE_KEYS:
  ApprovedMessageTemplateKey[] =
[
  "CALLBACK_CONFIRMATION",
  "LEAD_FOLLOW_UP",
  "HUMAN_TRANSFER_UNAVAILABLE",
];

const WHATSAPP_TEMPLATE_KEYS:
  ApprovedWhatsAppTemplateKey[] =
[
  "CALLBACK_CONFIRMATION",
  "LEAD_FOLLOW_UP",
  "HUMAN_TRANSFER_UNAVAILABLE",
];

//--------------------------------------------------
// Normalized Action Types
//--------------------------------------------------

interface CallbackActionArgs {
  phone:
    string;

  scheduledFor:
    string;

  timezone:
    string;

  reason?:
    string;
}

interface CreateLeadActionArgs {
  fullName?:
    string;

  phone?:
    string;

  email?:
    string;

  interest:
    string;

  notes?:
    string;
}

interface SendSmsActionArgs {
  recipient:
    string;

  templateKey:
    ApprovedMessageTemplateKey;

  variables:
    MessageTemplateVariables;
}

interface SendWhatsAppActionArgs {
  recipient:
    string;

  templateKey:
    ApprovedWhatsAppTemplateKey;

  variables:
    WhatsAppTemplateVariables;
}

interface RecordConsentActionArgs {
  phone:
    string;

  channel:
    "SMS" |
    "WHATSAPP";

  status:
    "OPTED_IN" |
    "OPTED_OUT";
}

interface TransferActionArgs {
  reason?:
    string;
}

interface EndCallActionArgs {
  reason?:
    string;
}

//--------------------------------------------------
// Normalized Business Action
//--------------------------------------------------

type NormalizedBusinessAction =
  | {
      tool:
        "bookCallback";

      args:
        CallbackActionArgs;

      summary:
        string;
    }
  | {
      tool:
        "createLead";

      args:
        CreateLeadActionArgs;

      summary:
        string;
    }
  | {
      tool:
        "sendSms";

      args:
        SendSmsActionArgs;

      summary:
        string;
    }
  | {
      tool:
        "sendWhatsApp";

      args:
        SendWhatsAppActionArgs;

      summary:
        string;
    }
  | {
      tool:
        "recordConsent";

      args:
        RecordConsentActionArgs;

      summary:
        string;
    }
  | {
      tool:
        "transferToHuman";

      args:
        TransferActionArgs;

      summary:
        string;
    }
  | {
      tool:
        "endCall";

      args:
        EndCallActionArgs;

      summary:
        string;
    };

//--------------------------------------------------
// Normalize Result
//--------------------------------------------------

type NormalizeBusinessActionResult =
  | {
      success:
        true;

      action:
        NormalizedBusinessAction;
    }
  | {
      success:
        false;

      code:
        string;

      message:
        string;
    };

//--------------------------------------------------
// Execution Outcome
//--------------------------------------------------

type BusinessActionExecutionOutcome =
  | {
      success:
        true;

      output:
        unknown;
    }
  | {
      success:
        false;

      code:
        string;

      message:
        string;
    };

//--------------------------------------------------
// Function Declarations
//
// IMPORTANT:
//
// searchKnowledgeBase
//   -> executes immediately because read-only.
//
// All mutating tools:
//   -> PREPARE only.
//   -> no side effect.
//
// confirmBusinessAction
//   -> executes only after B1 server-side caller
//      confirmation has already been observed.
//--------------------------------------------------

const GEMINI_LIVE_FUNCTION_DECLARATIONS:
  FunctionDeclaration[] =
[
  //------------------------------------------------
  // RAG
  //------------------------------------------------

  {
    name:
      "searchKnowledgeBase",

    description:
      [
        "Search the approved private business knowledge base.",
        "Use this before answering business-specific questions about",
        "products, services, pricing, policies, procedures, eligibility,",
        "support information, or other private company information.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        query: {
          type:
            "string",

          description:
            "Concise semantic search query.",

          minLength:
            2,

          maxLength:
            1000,
        },

        limit: {
          type:
            "integer",

          minimum:
            1,

          maximum:
            10,

          default:
            5,
        },
      },

      required: [
        "query",
      ],
    },
  },

  //------------------------------------------------
  // Prepare Callback
  //------------------------------------------------

  {
    name:
      "bookCallback",

    description:
      [
        "Prepare a callback booking request.",
        "This function DOES NOT book the callback.",
        "It creates a pending action that must be explicitly confirmed",
        "by the caller before confirmBusinessAction can execute it.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        phone: {
          type:
            "string",

          description:
            "Customer callback phone number.",
        },

        scheduledFor: {
          type:
            "string",

          description:
            "Requested callback date/time as an ISO-compatible date-time string.",
        },

        timezone: {
          type:
            "string",

          description:
            "IANA timezone for the callback, for example Asia/Kolkata.",
        },

        reason: {
          type:
            "string",

          description:
            "Optional reason for the callback.",

          maxLength:
            500,
        },
      },

      required: [
        "phone",
        "scheduledFor",
        "timezone",
      ],
    },
  },

  //------------------------------------------------
  // Prepare Lead
  //------------------------------------------------

  {
    name:
      "createLead",

    description:
      [
        "Prepare creation of a customer lead.",
        "This function DOES NOT create the lead.",
        "The caller must explicitly confirm before confirmBusinessAction",
        "can create the lead.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        fullName: {
          type:
            "string",

          maxLength:
            150,
        },

        phone: {
          type:
            "string",
        },

        email: {
          type:
            "string",

          maxLength:
            320,
        },

        interest: {
          type:
            "string",

          description:
            "The customer's expressed interest.",

          maxLength:
            500,
        },

        notes: {
          type:
            "string",

          maxLength:
            1000,
        },
      },

      required: [
        "interest",
      ],
    },
  },

  //------------------------------------------------
  // Prepare SMS
  //------------------------------------------------

  {
    name:
      "sendSms",

    description:
      [
        "Prepare an SMS using an approved template.",
        "Never generate arbitrary SMS body text.",
        "This function DOES NOT send the message.",
        "Caller confirmation is required before confirmBusinessAction.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        recipient: {
          type:
            "string",

          description:
            "Recipient phone number.",
        },

        templateKey: {
          type:
            "string",

          enum: [
            "CALLBACK_CONFIRMATION",
            "LEAD_FOLLOW_UP",
            "HUMAN_TRANSFER_UNAVAILABLE",
          ],
        },

        variables: {
          type:
            "object",

          additionalProperties:
            false,

          properties: {
            customerName: {
              type:
                "string",
            },

            callbackTime: {
              type:
                "string",
            },

            businessName: {
              type:
                "string",
            },
          },
        },
      },

      required: [
        "recipient",
        "templateKey",
      ],
    },
  },

  //------------------------------------------------
  // Prepare WhatsApp
  //------------------------------------------------

  {
    name:
      "sendWhatsApp",

    description:
      [
        "Prepare a WhatsApp message using an approved template.",
        "Never generate an arbitrary WhatsApp template name.",
        "This function DOES NOT send the message.",
        "Caller confirmation is required before confirmBusinessAction.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        recipient: {
          type:
            "string",
        },

        templateKey: {
          type:
            "string",

          enum: [
            "CALLBACK_CONFIRMATION",
            "LEAD_FOLLOW_UP",
            "HUMAN_TRANSFER_UNAVAILABLE",
          ],
        },

        variables: {
          type:
            "object",

          additionalProperties:
            false,

          properties: {
            customerName: {
              type:
                "string",
            },

            callbackTime: {
              type:
                "string",
            },

            businessName: {
              type:
                "string",
            },
          },
        },
      },

      required: [
        "recipient",
        "templateKey",
      ],
    },
  },

  //------------------------------------------------
  // Prepare Consent
  //------------------------------------------------

  {
    name:
      "recordConsent",

    description:
      [
        "Prepare recording of explicit SMS or WhatsApp consent",
        "or consent revocation.",
        "This does not change consent until the caller explicitly",
        "confirms and confirmBusinessAction succeeds.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        phone: {
          type:
            "string",
        },

        channel: {
          type:
            "string",

          enum: [
            "SMS",
            "WHATSAPP",
          ],
        },

        status: {
          type:
            "string",

          enum: [
            "OPTED_IN",
            "OPTED_OUT",
          ],
        },
      },

      required: [
        "phone",
        "channel",
        "status",
      ],
    },
  },

  //------------------------------------------------
  // Prepare Human Transfer
  //
  // Destination is intentionally NOT model supplied.
  //
  // Server policy resolves the approved destination.
  //------------------------------------------------

  {
    name:
      "transferToHuman",

    description:
      [
        "Prepare transfer of the current call to an approved human agent.",
        "Do not provide a destination phone number.",
        "The server chooses the configured approved destination.",
        "Caller confirmation is required before transfer.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        reason: {
          type:
            "string",

          maxLength:
            500,
        },
      },
    },
  },

  //------------------------------------------------
  // Prepare End Call
  //------------------------------------------------

  {
    name:
      "endCall",

    description:
      [
        "Prepare a request to end the current telephone call.",
        "Do not end the call immediately.",
        "Caller confirmation is required first.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        reason: {
          type:
            "string",

          maxLength:
            500,
        },
      },
    },
  },

  //------------------------------------------------
  // Execute Confirmed Action
  //------------------------------------------------

  {
    name:
      "confirmBusinessAction",

    description:
      [
        "Execute a previously prepared business action.",
        "Call this only after the caller has explicitly confirmed",
        "the exact pending action.",
        "The server independently verifies caller confirmation.",
        "Calling this function cannot create confirmation by itself.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        actionId: {
          type:
            "string",

          description:
            "Pending action ID returned by the prepare tool.",
        },
      },

      required: [
        "actionId",
      ],
    },
  },

  //------------------------------------------------
  // Cancel Pending Action
  //------------------------------------------------

  {
    name:
      "cancelBusinessAction",

    description:
      [
        "Cancel a previously prepared business action.",
        "Use this when the caller rejects or changes their mind.",
      ].join(
        " "
      ),

    parametersJsonSchema: {
      type:
        "object",

      additionalProperties:
        false,

      properties: {
        actionId: {
          type:
            "string",
        },
      },

      required: [
        "actionId",
      ],
    },
  },
];

//--------------------------------------------------
// Get Function Declarations
//--------------------------------------------------

export function getGeminiLiveFunctionDeclarations():
  FunctionDeclaration[] {
  return [
    ...GEMINI_LIVE_FUNCTION_DECLARATIONS,
  ];
}

//--------------------------------------------------
// Execute Gemini Function Call
//--------------------------------------------------

export async function executeGeminiLiveFunctionCall(
  callId:
    string,

  functionCall:
    GeminiLiveFunctionCall,

  signal?:
    AbortSignal
): Promise<GeminiLiveFunctionResponse> {
  const normalizedCallId =
    callId.trim();

  //------------------------------------------------
  // Call ID Required
  //------------------------------------------------

  if (
    !normalizedCallId
  ) {
    throw new Error(
      "Call ID is required for Gemini Live function execution"
    );
  }

  const log =
    createCallLogger(
      normalizedCallId
    );

  const name =
    functionCall
      .name
      ?.trim() ??
    "";

  //------------------------------------------------
  // Function Name Required
  //------------------------------------------------

  if (
    !name
  ) {
    return toolError({
      functionCall,

      name:
        "unknown",

      code:
        "MISSING_FUNCTION_NAME",

      message:
        "Function name is required.",
    });
  }

  //------------------------------------------------
  // Audit Invocation
  //------------------------------------------------

  log.info(
    {
      event:
        "gemini.live.tool_dispatch",

      tool:
        name,

      functionCallIdPresent:
        Boolean(
          functionCall.id
        ),

      abortSignalPresent:
        Boolean(
          signal
        ),
    },
    "Gemini Live tool dispatch started"
  );

  //------------------------------------------------
  // Dispatch
  //------------------------------------------------

  try {
    //------------------------------------------------
    // Abort Boundary
    //------------------------------------------------

    throwIfAborted(
      signal
    );

    switch (
      name
    ) {
      //--------------------------------------------
      // Read-Only RAG
      //--------------------------------------------

      case "searchKnowledgeBase":
        return await executeKnowledgeTool(
          normalizedCallId,
          functionCall,
          signal
        );

      //--------------------------------------------
      // Execute Caller-Confirmed Pending Action
      //--------------------------------------------

      case "confirmBusinessAction":
        return await executeConfirmedBusinessAction(
          normalizedCallId,
          functionCall,
          signal
        );

      //--------------------------------------------
      // Cancel Pending Action
      //--------------------------------------------

      case "cancelBusinessAction":
        return cancelPendingBusinessAction(
          normalizedCallId,
          functionCall
        );

      //--------------------------------------------
      // Mutating Tools — PREPARE ONLY
      //--------------------------------------------

      case "bookCallback":
      case "createLead":
      case "sendSms":
      case "sendWhatsApp":
      case "recordConsent":
      case "transferToHuman":
      case "endCall":
        return prepareBusinessAction(
          normalizedCallId,
          name,
          functionCall
        );

      //--------------------------------------------
      // Fail Closed
      //--------------------------------------------

      default:
        return toolError({
          functionCall,

          name,

          code:
            "TOOL_NOT_ALLOWED",

          message:
            `Tool is not enabled for Gemini Live: ${name}`,
        });
    }
  } catch (
    error
  ) {
    //------------------------------------------------
    // Abort / Timeout / Gemini Cancellation
    //
    // Never convert an actual cancellation into a
    // normal TOOL_EXECUTION_FAILED response.
    //
    // The media coordinator owns timeout/circuit
    // handling and must receive the original abort
    // reason.
    //------------------------------------------------

    if (
      signal?.aborted
    ) {
      const abortError =
        normalizeAbortReason(
          signal.reason
        );

      log.warn(
        {
          event:
            "gemini.live.tool_execution_aborted",

          tool:
            name,

          functionCallIdPresent:
            Boolean(
              functionCall.id
            ),

          abortErrorName:
            abortError.name,

          error:
            normalizeError(
              abortError
            ),
        },
        "Gemini Live tool execution aborted"
      );

      throw abortError;
    }

    log.error(
      {
        event:
          "gemini.live.tool_execution_failed",

        tool:
          name,

        functionCallIdPresent:
          Boolean(
            functionCall.id
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Gemini Live tool execution failed"
    );

    return toolError({
      functionCall,

      name,

      code:
        "TOOL_EXECUTION_FAILED",

      message:
        "The requested operation could not be completed.",
    });
  }
}

//--------------------------------------------------
// Read-Only Knowledge Tool
//--------------------------------------------------

async function executeKnowledgeTool(
  callId:
    string,

  functionCall:
    GeminiLiveFunctionCall,

  signal?:
    AbortSignal
): Promise<GeminiLiveFunctionResponse> {
  throwIfAborted(
    signal
  );

  const args =
    functionCall.args ??
    {};

  const query =
    readRequiredString(
      args,
      "query",
      1000
    );

  //------------------------------------------------
  // Query Required
  //------------------------------------------------

  if (
    !query
  ) {
    return toolError({
      functionCall,

      name:
        "searchKnowledgeBase",

      code:
        "INVALID_QUERY",

      message:
        "A knowledge search query is required.",
    });
  }

  //------------------------------------------------
  // Optional Limit
  //------------------------------------------------

  const rawLimit =
    args.limit;

  let limit:
    number | undefined;

  if (
    typeof rawLimit ===
      "number" &&
    Number.isInteger(
      rawLimit
    )
  ) {
    limit =
      Math.max(
        1,
        Math.min(
          10,
          rawLimit
        )
      );
  }

  //------------------------------------------------
  // Existing Audited Gateway
  //------------------------------------------------

  const result =
    await requestKnowledgeSearch({
      callId,

      query,

      limit,

      requestedBy:
        "AI",

      signal,
    });

  throwIfAborted(
    signal
  );

  //------------------------------------------------
  // Failure
  //------------------------------------------------

  if (
    !result.success
  ) {
    return toolError({
      functionCall,

      name:
        "searchKnowledgeBase",

      code:
        result.error.code,

      message:
        result.error.message,
    });
  }

  //------------------------------------------------
  // Success
  //------------------------------------------------

  return {
    id:
      functionCall.id,

    name:
      "searchKnowledgeBase",

    response: {
      success:
        true,

      output:
        result.result,
    },
  };
}

//--------------------------------------------------
// Prepare Mutating Business Action
//
// NO side effect happens here.
//--------------------------------------------------

function prepareBusinessAction(
  callId:
    string,

  tool:
    GeminiLiveBusinessActionName,

  functionCall:
    GeminiLiveFunctionCall
): GeminiLiveFunctionResponse {
  const normalized =
    normalizeBusinessAction(
      tool,
      functionCall.args ??
      {}
    );

  //------------------------------------------------
  // Validate Before Asking Caller
  //------------------------------------------------

  if (
    !normalized.success
  ) {
    return toolError({
      functionCall,

      name:
        tool,

      code:
        normalized.code,

      message:
        normalized.message,
    });
  }

  //------------------------------------------------
  // Prepare Server-Owned Pending Action
  //------------------------------------------------

  const prepared =
    GeminiLiveActionConfirmationService
      .prepare({
        callId,

        tool:
          normalized
            .action
            .tool,

        args: {
          ...normalized
            .action
            .args,
        },

        summary:
          normalized
            .action
            .summary,

        /*
         * Use Gemini function-call ID when present.
         *
         * This also allows Live tool-call
         * cancellation IDs to map to pending actions.
         */
        actionId:
          functionCall.id,
      });

  //------------------------------------------------
  // Prepare Failure
  //------------------------------------------------

  if (
    !prepared.success
  ) {
    return {
      id:
        functionCall.id,

      name:
        tool,

      response: {
        success:
          false,

        error: {
          code:
            prepared.code,

          message:
            prepared.message,
        },

        pendingAction:
          prepared.pendingAction
            ? {
                actionId:
                  prepared
                    .pendingAction
                    .id,

                tool:
                  prepared
                    .pendingAction
                    .tool,

                summary:
                  prepared
                    .pendingAction
                    .summary,
              }
            : null,
      },
    };
  }

  //------------------------------------------------
  // Confirmation Required
  //------------------------------------------------

  return {
    id:
      functionCall.id,

    name:
      tool,

    response: {
      success:
        true,

      executed:
        false,

      status:
        "AWAITING_CALLER_CONFIRMATION",

      requiresCallerConfirmation:
        true,

      actionId:
        prepared
          .action
          .id,

      action:
        prepared
          .action
          .tool,

      summary:
        prepared
          .action
          .summary,

      instruction:
        [
          "Do not claim this action has completed.",
          "Ask the caller to explicitly confirm this exact action.",
          "After the caller explicitly confirms, call confirmBusinessAction with this actionId.",
        ].join(
          " "
        ),
    },
  };
}

//--------------------------------------------------
// Confirm + Execute
//--------------------------------------------------

async function executeConfirmedBusinessAction(
  callId:
    string,

  functionCall:
    GeminiLiveFunctionCall,

  signal?:
    AbortSignal
): Promise<GeminiLiveFunctionResponse> {
  throwIfAborted(
    signal
  );

  const actionId =
    readRequiredString(
      functionCall.args ??
      {},
      "actionId",
      300
    );

  //------------------------------------------------
  // Action ID Required
  //------------------------------------------------

  if (
    !actionId
  ) {
    return toolError({
      functionCall,

      name:
        "confirmBusinessAction",

      code:
        "ACTION_ID_REQUIRED",

      message:
        "A pending action ID is required.",
    });
  }

  //------------------------------------------------
  // Pending Action
  //------------------------------------------------

  const pending =
    GeminiLiveActionConfirmationService
      .getPending(
        callId
      );

  if (
    !pending ||
    pending.id !==
      actionId
  ) {
    return toolError({
      functionCall,

      name:
        "confirmBusinessAction",

      code:
        "PENDING_ACTION_NOT_FOUND",

      message:
        "The requested pending action is unavailable or expired.",
    });
  }

  //------------------------------------------------
  // Caller Confirmation Must Already Exist
  //
  // IMPORTANT:
  //
  // Gemini calling confirmBusinessAction cannot set
  // this state.
  //
  // B1 confirmation state is derived from caller
  // audio transcription only.
  //------------------------------------------------

  const confirmed =
    GeminiLiveActionConfirmationService
      .getConfirmed(
        callId,
        actionId
      );

  if (
    !confirmed
  ) {
    return {
      id:
        functionCall.id,

      name:
        "confirmBusinessAction",

      response: {
        success:
          false,

        executed:
          false,

        error: {
          code:
            "CALLER_CONFIRMATION_NOT_OBSERVED",

          message:
            "The server has not observed explicit caller confirmation for this action.",
        },

        actionId,

        action:
          pending.tool,

        summary:
          pending.summary,

        instruction:
          "Ask the caller for explicit confirmation. Do not execute or claim success yet.",
      },
    };
  }

  //------------------------------------------------
  // Cancellation Boundary Before Consumption
  //
  // If the caller/provider cancels before the action
  // is consumed, preserve the pending confirmed action
  // instead of consuming it without execution.
  //------------------------------------------------

  throwIfAborted(
    signal
  );

  //------------------------------------------------
  // Consume Exactly Once
  //------------------------------------------------

  const action =
    GeminiLiveActionConfirmationService
      .consumeConfirmed(
        callId,
        actionId
      );

  if (
    !action
  ) {
    return toolError({
      functionCall,

      name:
        "confirmBusinessAction",

      code:
        "ACTION_ALREADY_CONSUMED",

      message:
        "This confirmed business action is no longer available for execution.",
    });
  }

  //------------------------------------------------
  // Execute Existing Tool Service
  //------------------------------------------------

  const log =
    createCallLogger(
      callId
    );

  log.info(
    {
      event:
        "gemini.live.confirmed_action_execution_started",

      actionId:
        action.id,

      action:
        action.tool,

      functionCallIdPresent:
        Boolean(
          functionCall.id
        ),

      abortSignalPresent:
        Boolean(
          signal
        ),
    },
    "Executing caller-confirmed Gemini Live business action"
  );

  const outcome =
    await executePendingBusinessAction(
      action,
      signal
    );

  //------------------------------------------------
  // Audit Outcome
  //------------------------------------------------

  if (
    outcome.success
  ) {
    log.info(
      {
        event:
          "gemini.live.confirmed_action_execution_completed",

        actionId:
          action.id,

        action:
          action.tool,
      },
      "Caller-confirmed Gemini Live business action completed"
    );
  } else {
    log.warn(
      {
        event:
          "gemini.live.confirmed_action_execution_rejected_or_failed",

        actionId:
          action.id,

        action:
          action.tool,

        code:
          outcome.code,
      },
      "Caller-confirmed Gemini Live business action did not complete"
    );
  }

  //------------------------------------------------
  // Execution Failure
  //------------------------------------------------

  if (
    !outcome.success
  ) {
    return {
      id:
        functionCall.id,

      name:
        "confirmBusinessAction",

      response: {
        success:
          false,

        executed:
          false,

        actionId:
          action.id,

        action:
          action.tool,

        error: {
          code:
            outcome.code,

          message:
            outcome.message,
        },

        instruction:
          "Do not claim the business action succeeded.",
      },
    };
  }

  //------------------------------------------------
  // Execution Success
  //------------------------------------------------

  return {
    id:
      functionCall.id,

    name:
      "confirmBusinessAction",

    response: {
      success:
        true,

      executed:
        true,

      status:
        "COMPLETED",

      actionId:
        action.id,

      action:
        action.tool,

      output:
        outcome.output,
    },
  };
}

//--------------------------------------------------
// Cancel Pending Action
//--------------------------------------------------

function cancelPendingBusinessAction(
  callId:
    string,

  functionCall:
    GeminiLiveFunctionCall
): GeminiLiveFunctionResponse {
  const actionId =
    readRequiredString(
      functionCall.args ??
      {},
      "actionId",
      300
    );

  if (
    !actionId
  ) {
    return toolError({
      functionCall,

      name:
        "cancelBusinessAction",

      code:
        "ACTION_ID_REQUIRED",

      message:
        "A pending action ID is required.",
    });
  }

  const cancelled =
    GeminiLiveActionConfirmationService
      .cancel(
        callId,
        actionId
      );

  //------------------------------------------------
  // Cancellation Is Idempotent From Gemini's View
  //------------------------------------------------

  return {
    id:
      functionCall.id,

    name:
      "cancelBusinessAction",

    response: {
      success:
        true,

      actionId,

      cancelled,

      status:
        cancelled
          ? "CANCELLED"
          : "ALREADY_CANCELLED_OR_NOT_FOUND",
    },
  };
}

//--------------------------------------------------
// Execute Stored Confirmed Action
//--------------------------------------------------

async function executePendingBusinessAction(
  action:
    GeminiLivePendingAction,

  signal?:
    AbortSignal
): Promise<BusinessActionExecutionOutcome> {
  //------------------------------------------------
  // Abort Boundary
  //------------------------------------------------

  throwIfAborted(
    signal
  );

  //------------------------------------------------
  // Revalidate Stored Arguments
  //------------------------------------------------

  const normalized =
    normalizeBusinessAction(
      action.tool,
      action.args
    );

  if (
    !normalized.success
  ) {
    return {
      success:
        false,

      code:
        normalized.code,

      message:
        normalized.message,
    };
  }

  //------------------------------------------------
  // Stable Idempotency Key
  //------------------------------------------------

  const idempotencyKey =
    buildStableIdempotencyKey(
      action
    );

  //------------------------------------------------
  // Dispatch
  //------------------------------------------------

  switch (
    normalized.action.tool
  ) {
    //----------------------------------------------
    // Callback
    //----------------------------------------------

    case "bookCallback": {
      const result =
        await requestCallback({
          callId:
            action.callId,

          phone:
            normalized
              .action
              .args
              .phone,

          scheduledFor:
            normalized
              .action
              .args
              .scheduledFor,

          timezone:
            normalized
              .action
              .args
              .timezone,

          reason:
            normalized
              .action
              .args
              .reason,

          confirmed:
            true,

          requestedBy:
            "AI",

          idempotencyKey,

          signal,
        });

      return fromGatewayResult(
        result
      );
    }

    //----------------------------------------------
    // Lead
    //----------------------------------------------

    case "createLead": {
      const result =
        await requestLeadCreation({
          callId:
            action.callId,

          fullName:
            normalized
              .action
              .args
              .fullName,

          phone:
            normalized
              .action
              .args
              .phone,

          email:
            normalized
              .action
              .args
              .email,

          interest:
            normalized
              .action
              .args
              .interest,

          notes:
            normalized
              .action
              .args
              .notes,

          confirmed:
            true,

          requestedBy:
            "AI",

          idempotencyKey,

          signal,
        });

      return fromGatewayResult(
        result
      );
    }

    //----------------------------------------------
    // SMS
    //----------------------------------------------

    case "sendSms": {
      const result =
        await requestSms({
          callId:
            action.callId,

          recipient:
            normalized
              .action
              .args
              .recipient,

          templateKey:
            normalized
              .action
              .args
              .templateKey,

          variables:
            normalized
              .action
              .args
              .variables,

          confirmed:
            true,

          requestedBy:
            "AI",

          idempotencyKey,

          signal,
        });

      return fromGatewayResult(
        result
      );
    }

    //----------------------------------------------
    // WhatsApp
    //----------------------------------------------

    case "sendWhatsApp": {
      const result =
        await requestWhatsApp({
          callId:
            action.callId,

          recipient:
            normalized
              .action
              .args
              .recipient,

          templateKey:
            normalized
              .action
              .args
              .templateKey,

          variables:
            normalized
              .action
              .args
              .variables,

          confirmed:
            true,

          requestedBy:
            "AI",

          idempotencyKey,

          signal,
        });

      return fromGatewayResult(
        result
      );
    }

    //----------------------------------------------
    // Consent
    //
    // Confirmation evidence comes from B1.
    //
    // Gemini cannot provide or manufacture the
    // durable evidence text.
    //----------------------------------------------

    case "recordConsent": {
      const result =
        await requestConsentRecord({
          callId:
            action.callId,

          phone:
            normalized
              .action
              .args
              .phone,

          channel:
            normalized
              .action
              .args
              .channel,

          status:
            normalized
              .action
              .args
              .status,

          source:
            "GEMINI_LIVE_CALLER_CONFIRMATION",

          evidenceText:
            action
              .confirmationEvidence ??
            undefined,

          confirmed:
            true,

          requestedBy:
            "AI",

          idempotencyKey,

          signal,
        });

      return fromGatewayResult(
        result
      );
    }

    //----------------------------------------------
    // Human Transfer
    //
    // Gemini never controls the destination.
    //
    // The configured server-side policy selects the
    // approved destination and service window.
    //----------------------------------------------

    case "transferToHuman": {
      const policy =
        resolveHumanTransferPolicy();

      if (
        !policy.allowed ||
        !policy.destination
      ) {
        return {
          success:
            false,

          code:
            "TRANSFER_NOT_AVAILABLE",

          message:
            policy.reason ||
            "Human transfer is not currently available.",
        };
      }

      const result =
        await requestHumanTransfer({
          callId:
            action.callId,

          destination:
            policy.destination,

          announcement:
            policy.announcement ??
            undefined,

          reason:
            normalized
              .action
              .args
              .reason ??
            "Caller requested a human agent",

          timeoutSeconds:
            policy.timeoutSeconds,

          confirmed:
            true,

          requestedBy:
            "AI",

          idempotencyKey,

          signal,
        });

      return fromGatewayResult(
        result
      );
    }

    //----------------------------------------------
    // End Call
    //----------------------------------------------

    case "endCall": {
      const result =
        await requestEndCall({
          callId:
            action.callId,

          reason:
            normalized
              .action
              .args
              .reason,

          confirmed:
            true,

          requestedBy:
            "AI",

          idempotencyKey,

          signal,
        });

      return fromGatewayResult(
        result
      );
    }
  }
}

//--------------------------------------------------
// Normalize Business Action
//--------------------------------------------------

function normalizeBusinessAction(
  tool:
    GeminiLiveBusinessActionName,

  args:
    Record<
      string,
      unknown
    >
): NormalizeBusinessActionResult {
  switch (
    tool
  ) {
    //----------------------------------------------
    // Callback
    //----------------------------------------------

    case "bookCallback": {
      const phone =
        readRequiredString(
          args,
          "phone",
          100
        );

      const scheduledFor =
        readRequiredString(
          args,
          "scheduledFor",
          200
        );

      const timezone =
        readRequiredString(
          args,
          "timezone",
          100
        );

      const reason =
        readOptionalString(
          args,
          "reason",
          500
        );

      if (
        !phone
      ) {
        return invalidAction(
          "INVALID_CALLBACK_PHONE",
          "Callback phone number is required."
        );
      }

      if (
        !scheduledFor
      ) {
        return invalidAction(
          "INVALID_CALLBACK_TIME",
          "Callback date and time are required."
        );
      }

      if (
        !timezone
      ) {
        return invalidAction(
          "INVALID_CALLBACK_TIMEZONE",
          "Callback timezone is required."
        );
      }

      const normalizedArgs:
        CallbackActionArgs =
      {
        phone,

        scheduledFor,

        timezone,

        ...(reason
          ? {
              reason,
            }
          : {}),
      };

      return {
        success:
          true,

        action: {
          tool:
            "bookCallback",

          args:
            normalizedArgs,

          summary:
            sanitizeSummary(
              `Book a callback to ${phone} for ${scheduledFor} (${timezone})${reason ? ` about ${reason}` : ""}.`
            ),
        },
      };
    }

    //----------------------------------------------
    // Lead
    //----------------------------------------------

    case "createLead": {
      const fullName =
        readOptionalString(
          args,
          "fullName",
          150
        );

      const phone =
        readOptionalString(
          args,
          "phone",
          100
        );

      const email =
        readOptionalString(
          args,
          "email",
          320
        );

      const interest =
        readRequiredString(
          args,
          "interest",
          500
        );

      const notes =
        readOptionalString(
          args,
          "notes",
          1000
        );

      if (
        !interest
      ) {
        return invalidAction(
          "LEAD_INTEREST_REQUIRED",
          "Lead interest is required."
        );
      }

      if (
        !phone &&
        !email
      ) {
        return invalidAction(
          "LEAD_CONTACT_REQUIRED",
          "At least one lead contact method is required."
        );
      }

      const normalizedArgs:
        CreateLeadActionArgs =
      {
        ...(fullName
          ? {
              fullName,
            }
          : {}),

        ...(phone
          ? {
              phone,
            }
          : {}),

        ...(email
          ? {
              email,
            }
          : {}),

        interest,

        ...(notes
          ? {
              notes,
            }
          : {}),
      };

      const identity =
        fullName ||
        phone ||
        email ||
        "the caller";

      return {
        success:
          true,

        action: {
          tool:
            "createLead",

          args:
            normalizedArgs,

          summary:
            sanitizeSummary(
              `Create a lead for ${identity} with interest: ${interest}.`
            ),
        },
      };
    }

    //----------------------------------------------
    // SMS
    //----------------------------------------------

    case "sendSms": {
      const recipient =
        readRequiredString(
          args,
          "recipient",
          100
        );

      const rawTemplateKey =
        readRequiredString(
          args,
          "templateKey",
          100
        );

      if (
        !recipient
      ) {
        return invalidAction(
          "SMS_RECIPIENT_REQUIRED",
          "SMS recipient is required."
        );
      }

      const templateKey =
        resolveSmsTemplateKey(
          rawTemplateKey
        );

      if (
        !templateKey
      ) {
        return invalidAction(
          "INVALID_SMS_TEMPLATE",
          "SMS template is not approved."
        );
      }

      const variables =
        readMessageVariables(
          args.variables
        );

      if (
        templateKey ===
          "CALLBACK_CONFIRMATION" &&
        !variables.callbackTime
      ) {
        return invalidAction(
          "CALLBACK_TIME_REQUIRED",
          "callbackTime is required for the callback confirmation template."
        );
      }

      return {
        success:
          true,

        action: {
          tool:
            "sendSms",

          args: {
            recipient,

            templateKey,

            variables,
          },

          summary:
            sanitizeSummary(
              `Send the approved ${templateKey} SMS template to ${recipient}.`
            ),
        },
      };
    }

    //----------------------------------------------
    // WhatsApp
    //----------------------------------------------

    case "sendWhatsApp": {
      const recipient =
        readRequiredString(
          args,
          "recipient",
          100
        );

      const rawTemplateKey =
        readRequiredString(
          args,
          "templateKey",
          100
        );

      if (
        !recipient
      ) {
        return invalidAction(
          "WHATSAPP_RECIPIENT_REQUIRED",
          "WhatsApp recipient is required."
        );
      }

      const templateKey =
        resolveWhatsAppTemplateKey(
          rawTemplateKey
        );

      if (
        !templateKey
      ) {
        return invalidAction(
          "INVALID_WHATSAPP_TEMPLATE",
          "WhatsApp template is not approved."
        );
      }

      const variables =
        readWhatsAppVariables(
          args.variables
        );

      if (
        templateKey ===
          "CALLBACK_CONFIRMATION" &&
        !variables.callbackTime
      ) {
        return invalidAction(
          "CALLBACK_TIME_REQUIRED",
          "callbackTime is required for the callback confirmation template."
        );
      }

      return {
        success:
          true,

        action: {
          tool:
            "sendWhatsApp",

          args: {
            recipient,

            templateKey,

            variables,
          },

          summary:
            sanitizeSummary(
              `Send the approved ${templateKey} WhatsApp template to ${recipient}.`
            ),
        },
      };
    }

    //----------------------------------------------
    // Consent
    //----------------------------------------------

    case "recordConsent": {
      const phone =
        readRequiredString(
          args,
          "phone",
          100
        );

      const rawChannel =
        readRequiredString(
          args,
          "channel",
          30
        );

      const rawStatus =
        readRequiredString(
          args,
          "status",
          30
        );

      if (
        !phone
      ) {
        return invalidAction(
          "CONSENT_PHONE_REQUIRED",
          "Consent phone number is required."
        );
      }

      if (
        rawChannel !==
          "SMS" &&
        rawChannel !==
          "WHATSAPP"
      ) {
        return invalidAction(
          "INVALID_CONSENT_CHANNEL",
          "Consent channel must be SMS or WHATSAPP."
        );
      }

      if (
        rawStatus !==
          "OPTED_IN" &&
        rawStatus !==
          "OPTED_OUT"
      ) {
        return invalidAction(
          "INVALID_CONSENT_STATUS",
          "Consent status must be OPTED_IN or OPTED_OUT."
        );
      }

      const normalizedArgs:
        RecordConsentActionArgs =
      {
        phone,

        channel:
          rawChannel,

        status:
          rawStatus,
      };

      const actionDescription =
        rawStatus ===
          "OPTED_IN"
          ? "opt in to"
          : "opt out of";

      return {
        success:
          true,

        action: {
          tool:
            "recordConsent",

          args:
            normalizedArgs,

          summary:
            sanitizeSummary(
              `Record that ${phone} chooses to ${actionDescription} ${rawChannel} messaging.`
            ),
        },
      };
    }

    //----------------------------------------------
    // Human Transfer
    //----------------------------------------------

    case "transferToHuman": {
      const reason =
        readOptionalString(
          args,
          "reason",
          500
        );

      const normalizedArgs:
        TransferActionArgs =
      {
        ...(reason
          ? {
              reason,
            }
          : {}),
      };

      return {
        success:
          true,

        action: {
          tool:
            "transferToHuman",

          args:
            normalizedArgs,

          summary:
            reason
              ? sanitizeSummary(
                  `Transfer this call to an available human agent. Reason: ${reason}.`
                )
              : "Transfer this call to an available human agent.",
        },
      };
    }

    //----------------------------------------------
    // End Call
    //----------------------------------------------

    case "endCall": {
      const reason =
        readOptionalString(
          args,
          "reason",
          500
        );

      const normalizedArgs:
        EndCallActionArgs =
      {
        ...(reason
          ? {
              reason,
            }
          : {}),
      };

      return {
        success:
          true,

        action: {
          tool:
            "endCall",

          args:
            normalizedArgs,

          summary:
            reason
              ? sanitizeSummary(
                  `End the current phone call. Reason: ${reason}.`
                )
              : "End the current phone call.",
        },
      };
    }
  }
}

//--------------------------------------------------
// Gateway Result
//--------------------------------------------------

function fromGatewayResult(
  result:
    | Awaited<
        ReturnType<
          typeof requestCallback
        >
      >
    | Awaited<
        ReturnType<
          typeof requestLeadCreation
        >
      >
    | Awaited<
        ReturnType<
          typeof requestSms
        >
      >
    | Awaited<
        ReturnType<
          typeof requestWhatsApp
        >
      >
    | Awaited<
        ReturnType<
          typeof requestConsentRecord
        >
      >
    | Awaited<
        ReturnType<
          typeof requestHumanTransfer
        >
      >
    | Awaited<
        ReturnType<
          typeof requestEndCall
        >
      >
): BusinessActionExecutionOutcome {
  if (
    !result.success
  ) {
    return {
      success:
        false,

      code:
        result.error.code,

      message:
        result.error.message,
    };
  }

  return {
    success:
      true,

    output:
      result.result,
  };
}

//--------------------------------------------------
// Stable Idempotency Key
//--------------------------------------------------

function buildStableIdempotencyKey(
  action:
    GeminiLivePendingAction
): string {
  const safeActionId =
    action.id
      .trim()
      .replace(
        /[^A-Za-z0-9._:-]/g,
        "_"
      )
      .slice(
        0,
        160
      );

  return [
    "gemini-live",
    action.tool,
    safeActionId,
  ].join(
    ":"
  );
}

//--------------------------------------------------
// SMS Template
//--------------------------------------------------

function resolveSmsTemplateKey(
  value:
    string | null
):
  ApprovedMessageTemplateKey |
  null {
  if (
    !value
  ) {
    return null;
  }

  return SMS_TEMPLATE_KEYS
    .find(
      key =>
        key ===
        value
    ) ??
    null;
}

//--------------------------------------------------
// WhatsApp Template
//--------------------------------------------------

function resolveWhatsAppTemplateKey(
  value:
    string | null
):
  ApprovedWhatsAppTemplateKey |
  null {
  if (
    !value
  ) {
    return null;
  }

  return WHATSAPP_TEMPLATE_KEYS
    .find(
      key =>
        key ===
        value
    ) ??
    null;
}

//--------------------------------------------------
// SMS Variables
//--------------------------------------------------

function readMessageVariables(
  value:
    unknown
): MessageTemplateVariables {
  const record =
    isRecord(
      value
    )
      ? value
      : {};

  const customerName =
    readOptionalString(
      record,
      "customerName",
      200
    );

  const callbackTime =
    readOptionalString(
      record,
      "callbackTime",
      200
    );

  const businessName =
    readOptionalString(
      record,
      "businessName",
      200
    );

  return {
    ...(customerName
      ? {
          customerName,
        }
      : {}),

    ...(callbackTime
      ? {
          callbackTime,
        }
      : {}),

    ...(businessName
      ? {
          businessName,
        }
      : {}),
  };
}

//--------------------------------------------------
// WhatsApp Variables
//--------------------------------------------------

function readWhatsAppVariables(
  value:
    unknown
): WhatsAppTemplateVariables {
  const record =
    isRecord(
      value
    )
      ? value
      : {};

  const customerName =
    readOptionalString(
      record,
      "customerName",
      200
    );

  const callbackTime =
    readOptionalString(
      record,
      "callbackTime",
      200
    );

  const businessName =
    readOptionalString(
      record,
      "businessName",
      200
    );

  return {
    ...(customerName
      ? {
          customerName,
        }
      : {}),

    ...(callbackTime
      ? {
          callbackTime,
        }
      : {}),

    ...(businessName
      ? {
          businessName,
        }
      : {}),
  };
}

//--------------------------------------------------
// Required String
//--------------------------------------------------

function readRequiredString(
  args:
    Record<
      string,
      unknown
    >,

  key:
    string,

  maxLength:
    number
):
  string |
  null {
  const value =
    args[key];

  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .replace(
        /[\r\n\t]+/g,
        " "
      )
      .replace(
        /\s{2,}/g,
        " "
      )
      .slice(
        0,
        maxLength
      );

  return normalized ||
    null;
}

//--------------------------------------------------
// Optional String
//--------------------------------------------------

function readOptionalString(
  args:
    Record<
      string,
      unknown
    >,

  key:
    string,

  maxLength:
    number
):
  string |
  undefined {
  const value =
    args[key];

  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const normalized =
    value
      .trim()
      .replace(
        /[\r\n\t]+/g,
        " "
      )
      .replace(
        /\s{2,}/g,
        " "
      )
      .slice(
        0,
        maxLength
      );

  return normalized ||
    undefined;
}

//--------------------------------------------------
// Abort Guard
//--------------------------------------------------

function throwIfAborted(
  signal?:
    AbortSignal
): void {
  if (
    !signal?.aborted
  ) {
    return;
  }

  throw normalizeAbortReason(
    signal.reason
  );
}

//--------------------------------------------------
// Normalize Abort Reason
//--------------------------------------------------

function normalizeAbortReason(
  reason:
    unknown
): Error {
  if (
    reason instanceof
      Error
  ) {
    return reason;
  }

  const error =
    new Error(
      "Gemini Live tool execution was cancelled"
    );

  error.name =
    "GeminiLiveToolAbortError";

  return error;
}

//--------------------------------------------------
// Record Guard
//--------------------------------------------------

function isRecord(
  value:
    unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value
    )
  );
}

//--------------------------------------------------
// Invalid Action
//--------------------------------------------------

function invalidAction(
  code:
    string,

  message:
    string
): NormalizeBusinessActionResult {
  return {
    success:
      false,

    code,

    message,
  };
}

//--------------------------------------------------
// Safe Summary
//--------------------------------------------------

function sanitizeSummary(
  value:
    string
): string {
  return value
    .trim()
    .replace(
      /[\r\n\t]+/g,
      " "
    )
    .replace(
      /\s{2,}/g,
      " "
    )
    .slice(
      0,
      1000
    );
}

//--------------------------------------------------
// Tool Error
//--------------------------------------------------

function toolError(
  input: {
    functionCall:
      GeminiLiveFunctionCall;

    name:
      string;

    code:
      string;

    message:
      string;
  }
): GeminiLiveFunctionResponse {
  return {
    id:
      input
        .functionCall
        .id,

    name:
      input.name,

    response: {
      success:
        false,

      error: {
        code:
          input.code,

        message:
          input.message,
      },
    },
  };
}