import {
  executeBusinessTool,
} from "./tool-gateway.service";

import type {
  ToolExecutionResult,
} from "./tool-gateway.types";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface RequestHumanTransferInput {
  callId:
    string;

  destination:
    string;

  announcement?:
    string;

  reason?:
    string;

  timeoutSeconds?:
    number;

  confirmed:
    boolean;

  requestedBy?:
    | "AI"
    | "IVR"
    | "SYSTEM"
    | "USER";

  idempotencyKey:
    string;

  signal?:
    AbortSignal;
}

//--------------------------------------------------
// Request Human Transfer
//--------------------------------------------------

export async function requestHumanTransfer(
  input:
    RequestHumanTransferInput
): Promise<ToolExecutionResult> {
  const idempotencyKey =
    input
      .idempotencyKey
      .trim();

  if (
    !idempotencyKey
  ) {
    return {
      success:
        false,

      tool:
        "transferToHuman",

      callId:
        input.callId,

      durationMs:
        0,

      error: {
        code:
          "IDEMPOTENCY_KEY_REQUIRED",

        message:
          "Human transfer requires a stable idempotency key.",
      },
    };
  }

  return executeBusinessTool({
    tool:
      "transferToHuman",

    callId:
      input.callId,

    input: {
      destination:
        input.destination,

      strategy:
        "DIRECT_NUMBER",

      reason:
        input.reason,

      announcement:
        input.announcement,

      timeoutSeconds:
        input.timeoutSeconds,
    },

    confirmed:
      input.confirmed,

    requestedBy:
      input.requestedBy ??
      "SYSTEM",

    idempotencyKey,

    signal:
      input.signal,
  });
}