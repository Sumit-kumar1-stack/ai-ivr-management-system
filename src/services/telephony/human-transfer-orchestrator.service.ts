import {
  createCallLogger,
} from "@/lib/logger";

import {
  resolveHumanTransferPolicy,
} from "./human-transfer-policy.service";

import {
  requestHumanTransfer,
} from "@/services/tools/transfer-to-human.service";

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
}

//--------------------------------------------------
// Execute
//--------------------------------------------------

export async function orchestrateHumanTransfer(
  callId:
    string,

  reason?:
    string
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

  if (
    !policy.allowed ||
    !policy.destination
  ) {
    log.info(
      {
        event:
          "human_transfer.policy_denied",

        reason:
          policy.reason,
      },
      "Human transfer denied by policy"
    );

    return {
      requested:
        true,

      transferred:
        false,

      message:
        policy.reason ||
        "A human agent is not available right now.",

      code:
        "TRANSFER_NOT_AVAILABLE",
    };
  }

  //------------------------------------------------
  // Stable Operation Key
  //------------------------------------------------

  const idempotencyKey =
    [
      "human-transfer",
      callId,
    ].join(
      ":"
    );

  //------------------------------------------------
  // Tool Gateway
  //------------------------------------------------

  const result =
    await requestHumanTransfer({
      callId,

      destination:
        policy.destination,

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

    return {
      requested:
        true,

      transferred:
        false,

      message:
        "I could not connect the call to a human agent right now.",

      code:
        result.error.code,
    };
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
  };
}