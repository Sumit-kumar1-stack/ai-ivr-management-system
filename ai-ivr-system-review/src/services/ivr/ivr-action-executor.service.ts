import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

import {
  requestCallback,
} from "@/services/tools/book-callback.service";

import type {
  ToolExecutionResult,
} from "@/services/tools/tool-gateway.types";

import {
  IVRAction,
} from "./ivr-runtime.types";

import {
  sendCallbackConfirmation,
} from "@/services/messaging/callback-confirmation-notification.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface IVRActionExecutionResult {
  action:
    IVRAction;

  handled:
    boolean;

  completed:
    boolean;

  requiresAI:
    boolean;

  shouldRepeatMenu:
    boolean;

  shouldEndCall:
    boolean;

  shouldTransferToHuman:
    boolean;

  callbackRequested:
    boolean;

  callbackBooked:
    boolean;

  callbackNeedsDetails:
    boolean;

  message:
    string;
}

//--------------------------------------------------
// Confirmed Callback Input
//--------------------------------------------------

export interface ConfirmedCallbackInput {
  phone:
    string;

  scheduledFor:
    string;

  timezone:
    string;

  reason?:
    string;

  idempotencyKey:
    string;

  requestedBy?:
    | "AI"
    | "IVR"
    | "SYSTEM"
    | "USER";

  signal?:
    AbortSignal;
}

//--------------------------------------------------
// Default Result
//--------------------------------------------------

function createResult(
  action:
    IVRAction,

  overrides:
    Partial<
      IVRActionExecutionResult
    > = {}
): IVRActionExecutionResult {
  return {
    action,

    handled:
      true,

    completed:
      true,

    requiresAI:
      false,

    shouldRepeatMenu:
      false,

    shouldEndCall:
      false,

    shouldTransferToHuman:
      false,

    callbackRequested:
      false,

    callbackBooked:
      false,

    callbackNeedsDetails:
      false,

    message:
      "",

    ...overrides,
  };
}

//--------------------------------------------------
// Shared IVR Action Executor
//--------------------------------------------------

export async function executeIVRAction(
  callId:
    string,

  action:
    IVRAction,

  configuredResponse?:
    string,

  value?:
    string
): Promise<IVRActionExecutionResult> {
  const log =
    createCallLogger(
      callId
    );

  try {
    //------------------------------------------------
    // Confirm Call Exists
    //------------------------------------------------

    const call =
      await prisma.call.findUnique({
        where: {
          id:
            callId,
        },

        select: {
          id:
            true,

          contactId:
            true,

          campaignId:
            true,

          providerCallId:
            true,

          status:
            true,

          direction:
            true,

          language:
            true,
        },
      });

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "ivr.action.rejected",

          action,

          reason:
            "call_not_found",
        },
        "IVR action rejected because call was not found"
      );

      return createResult(
        action,
        {
          handled:
            false,

          completed:
            false,

          message:
            "The call session could not be found.",
        }
      );
    }

    log.info(
      {
        event:
          "ivr.action.started",

        action,

        campaignId:
          call.campaignId,

        contactId:
          call.contactId,

        callDirection:
          call.direction,

        valuePresent:
          Boolean(
            value
          ),
      },
      "IVR semantic action started"
    );

    //------------------------------------------------
    // Loan Information
    //------------------------------------------------

    if (
      action ===
      "LOAN_INFORMATION"
    ) {
      return createResult(
        action,
        {
          requiresAI:
            true,

          message:
            configuredResponse ||
            "Please tell me what you would like to know about loans.",
        }
      );
    }

    //------------------------------------------------
    // Deposit Information
    //------------------------------------------------

    if (
      action ===
      "DEPOSIT_INFORMATION"
    ) {
      return createResult(
        action,
        {
          requiresAI:
            true,

          message:
            configuredResponse ||
            "Please tell me what you would like to know about deposits.",
        }
      );
    }

    //------------------------------------------------
    // Branch Information
    //------------------------------------------------

    if (
      action ===
      "BRANCH_INFORMATION"
    ) {
      return createResult(
        action,
        {
          requiresAI:
            true,

          message:
            configuredResponse ||
            "Please tell me which branch information you need.",
        }
      );
    }

    //------------------------------------------------
    // Continue AI Conversation
    //------------------------------------------------

    if (
      action ===
      "CONTINUE_AI"
    ) {
      return createResult(
        action,
        {
          requiresAI:
            true,

          message:
            configuredResponse ||
            "How may I help you?",
        }
      );
    }

    //------------------------------------------------
    // Request Callback
    //------------------------------------------------

    if (
      action ===
      "REQUEST_CALLBACK"
    ) {
      /*
       * Selecting callback from the IVR menu is only
       * an expression of intent.
       *
       * We must NOT persist a callback here because
       * we do not yet have:
       *
       * - confirmed callback phone number
       * - preferred callback date/time
       * - timezone
       * - explicit confirmation
       * - stable idempotency key
       *
       * The caller is therefore moved into the
       * conversational runtime to collect those details.
       */

      log.info(
        {
          event:
            "ivr.callback.intent_captured",

          contactId:
            call.contactId,

          campaignId:
            call.campaignId,

          callDirection:
            call.direction,
        },
        "Callback intent captured; additional details are required"
      );

      return createResult(
        action,
        {
          completed:
            false,

          requiresAI:
            true,

          callbackRequested:
            true,

          callbackBooked:
            false,

          callbackNeedsDetails:
            true,

          message:
            configuredResponse ||
            "I can help arrange a callback. Please tell me the phone number to use and your preferred callback time.",
        }
      );
    }

    //------------------------------------------------
    // Human Agent
    //------------------------------------------------

    if (
      action ===
      "HUMAN_AGENT"
    ) {
      log.info(
        {
          event:
            "ivr.human_transfer.requested",

          providerCallIdPresent:
            Boolean(
              call.providerCallId
            ),
        },
        "Human-agent transfer requested"
      );

      return createResult(
        action,
        {
          shouldTransferToHuman:
            true,

          completed:
            false,

          message:
            configuredResponse ||
            "You requested a human agent.",
        }
      );
    }

    //------------------------------------------------
    // Repeat Menu
    //------------------------------------------------

    if (
      action ===
      "REPEAT_MENU"
    ) {
      return createResult(
        action,
        {
          shouldRepeatMenu:
            true,

          message:
            configuredResponse ||
            "Repeating the menu.",
        }
      );
    }

    //------------------------------------------------
    // End Call
    //------------------------------------------------

    if (
      action ===
      "END_CALL"
    ) {
      return createResult(
        action,
        {
          shouldEndCall:
            true,

          message:
            configuredResponse ||
            "Thank you for calling. Goodbye.",
        }
      );
    }

    //------------------------------------------------
    // Custom
    //------------------------------------------------

    if (
      action ===
      "CUSTOM"
    ) {
      if (
        !value
      ) {
        return createResult(
          action,
          {
            handled:
              false,

            completed:
              false,

            message:
              "This menu option is not configured correctly.",
          }
        );
      }

      return createResult(
        action,
        {
          requiresAI:
            true,

          message:
            configuredResponse ||
            "How may I help you?",
        }
      );
    }

    //------------------------------------------------
    // Defensive Fallback
    //------------------------------------------------

    return createResult(
      action,
      {
        handled:
          false,

        completed:
          false,

        message:
          "This option is currently unavailable.",
      }
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "ivr.action.failed",

        action,

        error:
          normalizeError(
            error
          ),
      },
      "IVR semantic action failed"
    );

    return createResult(
      action,
      {
        handled:
          false,

        completed:
          false,

        message:
          "I could not complete that request right now.",
      }
    );
  }
}

//--------------------------------------------------
// Execute Confirmed Callback
//--------------------------------------------------

export async function executeConfirmedCallback(
  callId:
    string,

  input:
    ConfirmedCallbackInput
): Promise<ToolExecutionResult> {
  const log =
    createCallLogger(
      callId
    );

  //--------------------------------------------------
  // Validate Required Confirmation Data
  //--------------------------------------------------

  const phone =
    input.phone.trim();

  const scheduledFor =
    input.scheduledFor.trim();

  const timezone =
    input.timezone.trim();

  const idempotencyKey =
    input.idempotencyKey.trim();

  if (
    !phone ||
    !scheduledFor ||
    !timezone ||
    !idempotencyKey
  ) {
    log.warn(
      {
        event:
          "ivr.callback.confirmation.rejected",

        phonePresent:
          Boolean(
            phone
          ),

        scheduledForPresent:
          Boolean(
            scheduledFor
          ),

        timezonePresent:
          Boolean(
            timezone
          ),

        idempotencyKeyPresent:
          Boolean(
            idempotencyKey
          ),
      },
      "Confirmed callback request is missing required data"
    );

    return {
      success:
        false,

      tool:
        "bookCallback",

      callId,

      durationMs:
        0,

      error: {
        code:
          "CALLBACK_DETAILS_REQUIRED",

        message:
          "Confirmed phone number, callback time, timezone, and idempotency key are required.",
      },
    };
  }

  //--------------------------------------------------
  // Execute Through Tool Gateway
  //--------------------------------------------------

  const result =
    await requestCallback({
      callId,

      phone,

      scheduledFor,

      timezone,

      reason:
        input.reason,

      confirmed:
        true,

      requestedBy:
        input.requestedBy ??
        "IVR",

      idempotencyKey,

      signal:
        input.signal,
    });

  //--------------------------------------------------
  // Audit Result
  //--------------------------------------------------

  if (
    result.success
  ) {
    log.info(
      {
        event:
          "ivr.callback.booking.completed",

        tool:
          result.tool,

        durationMs:
          result.durationMs,
      },
      "Confirmed callback successfully executed through Tool Gateway"
    );

    //------------------------------------------------
    // Transactional Confirmation
    //------------------------------------------------

    /*
     * Callback persistence is already successful.
     *
     * Messaging is intentionally secondary:
     * SMS/WhatsApp failure must NEVER roll back or
     * convert a valid callback booking into failure.
     */

    const notification =
      await sendCallbackConfirmation({
        callId,

        phone,

        scheduledFor,

        timezone,

        callbackIdempotencyKey:
          idempotencyKey,

        signal:
          input.signal,
      });

    log.info(
      {
        event:
          "ivr.callback.notification.result",

        attempted:
          notification.attempted,

        sent:
          notification.sent,

        channel:
          notification.channel,

        code:
          notification.code,
      },
      "Callback confirmation messaging processed"
    );
  } else {
    log.warn(
      {
        event:
          "ivr.callback.booking.failed",

        tool:
          result.tool,

        code:
          result.error.code,

        durationMs:
          result.durationMs,
      },
      "Confirmed callback could not be completed"
    );
  }

  return result;
}