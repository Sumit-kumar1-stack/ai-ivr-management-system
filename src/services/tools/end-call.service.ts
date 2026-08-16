import {
  executeBusinessTool,
} from "./tool-gateway.service";

import type {
  ToolExecutionResult,
} from "./tool-gateway.types";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface RequestEndCallInput {
  callId:
    string;

  reason?:
    string;

  confirmed:
    boolean;

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
// Request
//--------------------------------------------------

export async function requestEndCall(
  input:
    RequestEndCallInput
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
        "endCall",

      callId:
        input.callId,

      durationMs:
        0,

      error: {
        code:
          "IDEMPOTENCY_KEY_REQUIRED",

        message:
          "Ending a call requires a stable idempotency key.",
      },
    };
  }

  return executeBusinessTool({
    tool:
      "endCall",

    callId:
      input.callId,

    input: {
      reason:
        input.reason,
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