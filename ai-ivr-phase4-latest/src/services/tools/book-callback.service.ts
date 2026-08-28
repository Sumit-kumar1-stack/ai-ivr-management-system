import {
  randomUUID,
} from "node:crypto";

import {
  executeBusinessTool,
} from "./tool-gateway.service";

import type {
  ToolExecutionResult,
} from "./tool-gateway.types";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface RequestCallbackInput {
  callId:
    string;

  phone:
    string;

  scheduledFor:
    string;

  timezone:
    string;

  reason?:
    string;

  confirmed:
    boolean;

  requestedBy?:
    | "AI"
    | "IVR"
    | "SYSTEM"
    | "USER";

  idempotencyKey?:
    string;

  signal?:
    AbortSignal;
}

//--------------------------------------------------
// Request Callback
//--------------------------------------------------

export async function requestCallback(
  input:
    RequestCallbackInput
): Promise<ToolExecutionResult> {
  const idempotencyKey =
    input
      .idempotencyKey
      ?.trim() ||
    [
      "callback",
      input.callId,
      randomUUID(),
    ].join(
      ":"
    );

  return executeBusinessTool({
    tool:
      "bookCallback",

    callId:
      input.callId,

    input: {
      phone:
        input.phone,

      scheduledFor:
        input.scheduledFor,

      timezone:
        input.timezone,

      reason:
        input.reason,
    },

    requestedBy:
      input.requestedBy ??
      "SYSTEM",

    confirmed:
      input.confirmed,

    idempotencyKey,

    signal:
      input.signal,
  });
}