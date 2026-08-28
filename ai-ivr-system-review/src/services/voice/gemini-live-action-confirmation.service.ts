import {
  randomUUID,
} from "node:crypto";

import {
  createCallLogger,
} from "@/lib/logger";

//--------------------------------------------------
// Supported Premium Business Actions
//--------------------------------------------------

export type GeminiLiveBusinessActionName =
  | "bookCallback"
  | "createLead"
  | "sendSms"
  | "sendWhatsApp"
  | "recordConsent"
  | "transferToHuman"
  | "endCall";

//--------------------------------------------------
// Pending Action
//--------------------------------------------------

export interface GeminiLivePendingAction {
  id:
    string;

  callId:
    string;

  tool:
    GeminiLiveBusinessActionName;

  args:
    Record<
      string,
      unknown
    >;

  summary:
    string;

  createdAt:
    number;

  expiresAt:
    number;

  confirmedAt:
    number |
    null;

  confirmationEvidence:
    string |
    null;
}

//--------------------------------------------------
// Prepare Result
//--------------------------------------------------

export type PrepareGeminiLiveActionResult =
  | {
      success:
        true;

      action:
        GeminiLivePendingAction;
    }
  | {
      success:
        false;

      code:
        string;

      message:
        string;

      pendingAction?:
        GeminiLivePendingAction;
    };

//--------------------------------------------------
// Confirmation Observation Result
//--------------------------------------------------

export type GeminiLiveConfirmationObservation =
  | {
      status:
        "NONE";
    }
  | {
      status:
        "CONFIRMED";

      actionId:
        string;

      evidence:
        string;
    }
  | {
      status:
        "CANCELLED";

      actionId:
        string;

      evidence:
        string;
    };

//--------------------------------------------------
// Confirmation Requirement
//
// Keep this short enough for a live phone turn.
//
// If the caller takes too long, Gemini must prepare
// the action again rather than executing stale data.
//--------------------------------------------------

const PENDING_ACTION_TTL_MS =
  2 *
  60 *
  1000;

//--------------------------------------------------
// Explicit Positive Confirmation
//
// Deliberately conservative.
//
// Do NOT accept a bare:
//   "okay"
//   "sure"
//   "fine"
//
// because those phrases may acknowledge information
// without authorizing a side effect.
//--------------------------------------------------

const EXPLICIT_CONFIRMATION_PATTERNS:
  RegExp[] =
[
  /^yes$/i,

  /^yes please$/i,

  /^yes do it$/i,

  /^yes go ahead$/i,

  /^yes proceed$/i,

  /^i confirm$/i,

  /^i confirm it$/i,

  /^i confirm that$/i,

  /^confirm$/i,

  /^confirm it$/i,

  /^please confirm$/i,

  /^go ahead$/i,

  /^go ahead please$/i,

  /^please go ahead$/i,

  /^do it$/i,

  /^please do it$/i,

  /^proceed$/i,

  /^please proceed$/i,
];

//--------------------------------------------------
// Explicit Cancellation / Rejection
//--------------------------------------------------

const EXPLICIT_REJECTION_PATTERNS:
  RegExp[] =
[
  /^no$/i,

  /^no thanks$/i,

  /^no thank you$/i,

  /^do not$/i,

  /^don't$/i,

  /^dont$/i,

  /^do not do it$/i,

  /^don't do it$/i,

  /^dont do it$/i,

  /^cancel$/i,

  /^cancel it$/i,

  /^please cancel$/i,

  /^never mind$/i,

  /^nevermind$/i,

  /^not now$/i,

  /^stop$/i,
];

//--------------------------------------------------
// Service
//--------------------------------------------------

class GeminiLiveActionConfirmationManager {
  //------------------------------------------------
  // One Pending Action Per Call
  //
  // This avoids ambiguity such as:
  //
  // AI:
  //   "Confirm SMS and callback?"
  //
  // Caller:
  //   "yes"
  //
  // We require separate confirmation for each
  // mutating operation.
  //------------------------------------------------

  private readonly pendingByCall =
    new Map<
      string,
      GeminiLivePendingAction
    >();

  //------------------------------------------------
  // Prepare
  //------------------------------------------------

  prepare(
    input: {
      callId:
        string;

      tool:
        GeminiLiveBusinessActionName;

      args:
        Record<
          string,
          unknown
        >;

      summary:
        string;

      actionId?:
        string;
    }
  ): PrepareGeminiLiveActionResult {
    const callId =
      input.callId
        .trim();

    if (
      !callId
    ) {
      return {
        success:
          false,

        code:
          "INVALID_CALL_ID",

        message:
          "Call ID is required.",
      };
    }

    const summary =
      sanitizeSummary(
        input.summary
      );

    if (
      !summary
    ) {
      return {
        success:
          false,

        code:
          "ACTION_SUMMARY_REQUIRED",

        message:
          "A confirmation summary is required.",
      };
    }

    //------------------------------------------------
    // Remove Expired Action First
    //------------------------------------------------

    this.removeExpired(
      callId
    );

    //------------------------------------------------
    // Existing Pending Action
    //------------------------------------------------

    const existing =
      this.pendingByCall.get(
        callId
      );

    if (
      existing
    ) {
      return {
        success:
          false,

        code:
          "PENDING_ACTION_EXISTS",

        message:
          "Another business action is already waiting for caller confirmation.",

        pendingAction:
          clonePendingAction(
            existing
          ),
      };
    }

    //------------------------------------------------
    // Create Pending Action
    //------------------------------------------------

    const now =
      Date.now();

    const requestedActionId =
      input.actionId
        ?.trim();

    const action:
      GeminiLivePendingAction =
    {
      id:
        requestedActionId ||
        randomUUID(),

      callId,

      tool:
        input.tool,

      args: {
        ...input.args,
      },

      summary,

      createdAt:
        now,

      expiresAt:
        now +
        PENDING_ACTION_TTL_MS,

      confirmedAt:
        null,

      confirmationEvidence:
        null,
    };

    this.pendingByCall.set(
      callId,
      action
    );

    const log =
      createCallLogger(
        callId
      );

    log.info(
      {
        event:
          "gemini.live.business_action_prepared",

        actionId:
          action.id,

        tool:
          action.tool,

        expiresAt:
          action.expiresAt,
      },
      "Premium business action is waiting for explicit caller confirmation"
    );

    return {
      success:
        true,

      action:
        clonePendingAction(
          action
        ),
    };
  }

  //------------------------------------------------
  // Observe Caller Transcript
  //
  // IMPORTANT:
  //
  // This is the server-side authorization boundary.
  //
  // Gemini cannot set `confirmed = true`.
  // Confirmation is derived only from caller speech
  // transcribed from the live telephone stream.
  //------------------------------------------------

  observeCallerTranscript(
    callId:
      string,

    transcript:
      string
  ): GeminiLiveConfirmationObservation {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return {
        status:
          "NONE",
      };
    }

    this.removeExpired(
      normalizedCallId
    );

    const action =
      this.pendingByCall.get(
        normalizedCallId
      );

    if (
      !action
    ) {
      return {
        status:
          "NONE",
      };
    }

    const evidence =
      normalizeConfirmationTranscript(
        transcript
      );

    if (
      !evidence
    ) {
      return {
        status:
          "NONE",
      };
    }

    //------------------------------------------------
    // Explicit Rejection Takes Priority
    //------------------------------------------------

    if (
      matchesAny(
        evidence,
        EXPLICIT_REJECTION_PATTERNS
      )
    ) {
      const actionId =
        action.id;

      this.pendingByCall.delete(
        normalizedCallId
      );

      const log =
        createCallLogger(
          normalizedCallId
        );

      log.info(
        {
          event:
            "gemini.live.business_action_rejected",

          actionId,

          tool:
            action.tool,

          evidenceCharacterCount:
            evidence.length,
        },
        "Caller rejected pending Premium business action"
      );

      return {
        status:
          "CANCELLED",

        actionId,

        evidence,
      };
    }

    //------------------------------------------------
    // Explicit Positive Confirmation
    //------------------------------------------------

    if (
      !matchesAny(
        evidence,
        EXPLICIT_CONFIRMATION_PATTERNS
      )
    ) {
      return {
        status:
          "NONE",
      };
    }

    //------------------------------------------------
    // Mark Confirmed
    //------------------------------------------------

    action.confirmedAt =
      Date.now();

    action.confirmationEvidence =
      evidence;

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.info(
      {
        event:
          "gemini.live.business_action_confirmed",

        actionId:
          action.id,

        tool:
          action.tool,

        confirmationLatencyMs:
          Math.max(
            0,
            action.confirmedAt -
            action.createdAt
          ),

        evidenceCharacterCount:
          evidence.length,
      },
      "Caller explicitly confirmed Premium business action"
    );

    return {
      status:
        "CONFIRMED",

      actionId:
        action.id,

      evidence,
    };
  }

  //------------------------------------------------
  // Get Pending
  //------------------------------------------------

  getPending(
    callId:
      string
  ):
    GeminiLivePendingAction |
    null {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return null;
    }

    this.removeExpired(
      normalizedCallId
    );

    const action =
      this.pendingByCall.get(
        normalizedCallId
      );

    if (
      !action
    ) {
      return null;
    }

    return clonePendingAction(
      action
    );
  }

  //------------------------------------------------
  // Get Confirmed Action
  //
  // Does NOT consume it.
  //
  // Execution code must call consumeConfirmed()
  // immediately before/after dispatch according to
  // its failure strategy.
  //------------------------------------------------

  getConfirmed(
    callId:
      string,

    actionId:
      string
  ):
    GeminiLivePendingAction |
    null {
    const normalizedCallId =
      callId.trim();

    const normalizedActionId =
      actionId.trim();

    if (
      !normalizedCallId ||
      !normalizedActionId
    ) {
      return null;
    }

    this.removeExpired(
      normalizedCallId
    );

    const action =
      this.pendingByCall.get(
        normalizedCallId
      );

    if (
      !action ||
      action.id !==
        normalizedActionId ||
      !action.confirmedAt ||
      !action.confirmationEvidence
    ) {
      return null;
    }

    return clonePendingAction(
      action
    );
  }

  //------------------------------------------------
  // Consume Confirmed Action
  //
  // A confirmed action can be consumed only once.
  //
  // Stable idempotency keys in the existing Tool
  // Gateway provide the second layer of duplicate
  // protection if execution is retried later.
  //------------------------------------------------

  consumeConfirmed(
    callId:
      string,

    actionId:
      string
  ):
    GeminiLivePendingAction |
    null {
    const action =
      this.getConfirmed(
        callId,
        actionId
      );

    if (
      !action
    ) {
      return null;
    }

    this.pendingByCall.delete(
      action.callId
    );

    return action;
  }

  //------------------------------------------------
  // Cancel Specific Action
  //------------------------------------------------

  cancel(
    callId:
      string,

    actionId:
      string
  ): boolean {
    const normalizedCallId =
      callId.trim();

    const normalizedActionId =
      actionId.trim();

    if (
      !normalizedCallId ||
      !normalizedActionId
    ) {
      return false;
    }

    const action =
      this.pendingByCall.get(
        normalizedCallId
      );

    if (
      !action ||
      action.id !==
        normalizedActionId
    ) {
      return false;
    }

    this.pendingByCall.delete(
      normalizedCallId
    );

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.info(
      {
        event:
          "gemini.live.business_action_cancelled",

        actionId:
          action.id,

        tool:
          action.tool,
      },
      "Pending Premium business action cancelled"
    );

    return true;
  }

  //------------------------------------------------
  // Cancel By Gemini Tool-Call IDs
  //
  // We use Gemini's function-call ID as the pending
  // action ID whenever available. Therefore a Live
  // toolCallCancellation message can cancel the
  // exact pending action.
  //------------------------------------------------

  cancelByActionIds(
    callId:
      string,

    actionIds:
      string[]
  ): number {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId ||
      actionIds.length ===
        0
    ) {
      return 0;
    }

    const pending =
      this.pendingByCall.get(
        normalizedCallId
      );

    if (
      !pending
    ) {
      return 0;
    }

    const normalizedIds =
      new Set(
        actionIds
          .map(
            value =>
              value.trim()
          )
          .filter(
            Boolean
          )
      );

    if (
      !normalizedIds.has(
        pending.id
      )
    ) {
      return 0;
    }

    this.pendingByCall.delete(
      normalizedCallId
    );

    return 1;
  }

  //------------------------------------------------
  // Clear Call
  //------------------------------------------------

  clearCall(
    callId:
      string
  ): void {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return;
    }

    this.pendingByCall.delete(
      normalizedCallId
    );
  }

  //------------------------------------------------
  // Remove Expired
  //------------------------------------------------

  private removeExpired(
    callId:
      string
  ): void {
    const action =
      this.pendingByCall.get(
        callId
      );

    if (
      !action
    ) {
      return;
    }

    if (
      action.expiresAt >
      Date.now()
    ) {
      return;
    }

    this.pendingByCall.delete(
      callId
    );

    const log =
      createCallLogger(
        callId
      );

    log.info(
      {
        event:
          "gemini.live.business_action_expired",

        actionId:
          action.id,

        tool:
          action.tool,
      },
      "Pending Premium business action expired"
    );
  }
}

//--------------------------------------------------
// Confirmation Transcript Normalization
//--------------------------------------------------

function normalizeConfirmationTranscript(
  value:
    string
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[.,!?;:]+$/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .slice(
      0,
      200
    );
}

//--------------------------------------------------
// Match
//--------------------------------------------------

function matchesAny(
  value:
    string,

  patterns:
    RegExp[]
): boolean {
  return patterns.some(
    pattern =>
      pattern.test(
        value
      )
  );
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
// Clone
//--------------------------------------------------

function clonePendingAction(
  action:
    GeminiLivePendingAction
): GeminiLivePendingAction {
  return {
    ...action,

    args: {
      ...action.args,
    },
  };
}

//--------------------------------------------------
// Singleton
//--------------------------------------------------

export const GeminiLiveActionConfirmationService =
  new GeminiLiveActionConfirmationManager();