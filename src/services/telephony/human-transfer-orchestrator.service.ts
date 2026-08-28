import {
  createCallLogger,
} from "@/lib/logger";

import {
  resolveHumanTransferPolicy,
} from "./human-transfer-policy.service";

import {
  requestHumanTransfer,
} from "@/services/tools/transfer-to-human.service";

import {
  getCall,
} from "@/services/calls/call.service";

import {
  beginCallbackConversation,
} from "@/services/conversations/callback-conversation.service";
import {
  buildAgentHandoffContext,
} from "./agent-handoff-context.service";
import {
  persistAgentHandoffContext,
  persistTransferLifecycle,
} from "./agent-transfer-persistence.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface HumanTransferOrchestrationResult {
  requested:
    boolean;

  transferred:
    boolean;

  message:
    string;

  code:
    string | null;

  callbackOffered:
    boolean;
}

//--------------------------------------------------
// Execute
//--------------------------------------------------

export async function orchestrateHumanTransfer(
  callId:
    string,

  reason?:
    string,

  options?: {
    destination?: string;
    destinationUserId?: string;
  }
): Promise<HumanTransferOrchestrationResult> {
  const log =
    createCallLogger(
      callId
    );

  //------------------------------------------------
  // Policy
  //------------------------------------------------

  const policy =
    resolveHumanTransferPolicy();

  log.info({ event: "agent.transfer.requested" }, "Human transfer requested");
  await persistTransferLifecycle(callId, "REQUESTED");
  log.info({ event: "agent.transfer.policy_checked", allowed: policy.allowed, destinationConfigured: Boolean(options?.destination) }, "Human transfer policy checked");
  await persistTransferLifecycle(callId, "POLICY_CHECKED", { allowed: policy.allowed, destinationConfigured: Boolean(options?.destination) });

  if (
    !policy.allowed ||
    !options?.destination
  ) {
    log.info(
      {
        event:
          "human_transfer.policy_denied",

        reason:
          policy.reason ?? "No tenant transfer destination was selected.",
      },
      "Human transfer denied by policy"
    );

    return unavailableTransferResult(
      callId,
      policy.reason ||
        "A tenant transfer destination was not selected.",
      "TRANSFER_NOT_AVAILABLE",
      reason
    );
  }

  //------------------------------------------------
  // Stable Operation Key
  //------------------------------------------------

  const idempotencyKey =
    [
      "human-transfer",
      callId,
      options.destinationUserId ?? options.destination,
    ].join(
      ":"
    );

  const handoff = await buildAgentHandoffContext(callId);
  if (handoff) await persistAgentHandoffContext(handoff);
  await persistTransferLifecycle(callId, "CONTEXT_READY", { contextAvailable: Boolean(handoff) });
  log.info({ event: "agent.transfer.context_ready", contextAvailable: Boolean(handoff), intent: handoff?.customerIntent ?? null, department: handoff?.department ?? null }, "Safe agent handoff context prepared");

  //------------------------------------------------
  // Tool Gateway
  //------------------------------------------------

  const result =
    await requestHumanTransfer({
      callId,

      destination:
        options.destination,

      announcement:
        policy.announcement ??
        undefined,

      reason:
        reason?.trim() ||
        "Caller requested a human agent",

      timeoutSeconds:
        policy.timeoutSeconds,

      /*
       * Selecting HUMAN_AGENT through the keypad is
       * the explicit user request/confirmation for
       * this operation.
       */
      confirmed:
        true,

      requestedBy:
        "IVR",

      idempotencyKey,
    });

  //------------------------------------------------
  // Failure
  //------------------------------------------------

  if (
    !result.success
  ) {
    log.warn(
      {
        event:
          "human_transfer.tool_failed",

        code:
          result.error.code,

        durationMs:
          result.durationMs,
      },
      "Human transfer tool failed"
    );

    return unavailableTransferResult(
      callId,
      "I could not connect the call to a human agent right now.",
      result.error.code,
      reason
    );
  }

  //------------------------------------------------
  // Accepted
  //------------------------------------------------

  log.info(
    {
      event:
        "human_transfer.tool_accepted",

      durationMs:
        result.durationMs,
    },
    "Human transfer accepted by telephony provider"
  );

  return {
    requested:
      true,

    /*
     * Here transferred means the provider accepted
     * the transfer operation.
     *
     * It does NOT mean a human agent answered.
     */
    transferred:
      true,

    message:
      "Your call is being connected to a human agent.",

    code:
      null,

    callbackOffered:
      false,
  };
}

async function unavailableTransferResult(
  callId: string,
  fallbackMessage: string,
  code: string,
  reason?: string
): Promise<HumanTransferOrchestrationResult> {
  const log = createCallLogger(callId);
  await persistTransferLifecycle(callId, "UNAVAILABLE", { code });

  try {
    const call = await getCall(callId);

    if (!call || call.inboundProfile?.callbackEnabled === false) {
      return {
        requested: true,
        transferred: false,
        message: fallbackMessage,
        code,
        callbackOffered: false,
      };
    }

    const callback = await beginCallbackConversation(callId, {
      phone:
        call.direction === "INBOUND"
          ? call.callerNumber ?? undefined
          : call.contactPhoneSnapshot ?? undefined,
      reason: reason?.trim() || "Human transfer unavailable",
    });

    return {
      requested: true,
      transferred: false,
      message: `${fallbackMessage} ${callback.prompt}`,
      code,
      callbackOffered: callback.handled,
    };
  } catch (error) {
    log.warn(
      {
        event: "human_transfer.callback_fallback_failed",
        error,
      },
      "Callback fallback could not be started after a human transfer failure"
    );

    return {
      requested: true,
      transferred: false,
      message: fallbackMessage,
      code,
      callbackOffered: false,
    };
  }
}
