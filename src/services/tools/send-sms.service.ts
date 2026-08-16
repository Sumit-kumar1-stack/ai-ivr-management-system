import {
  executeBusinessTool,
} from "./tool-gateway.service";

import type {
  ToolExecutionResult,
} from "./tool-gateway.types";

import type {
  ApprovedMessageTemplateKey,
  MessageTemplateVariables,
} from "@/services/messaging/message-template.service";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface RequestSmsInput {
  callId:
    string;

  recipient:
    string;

  templateKey:
    ApprovedMessageTemplateKey;

  variables:
    MessageTemplateVariables;

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
// Request SMS
//--------------------------------------------------

export async function requestSms(
  input:
    RequestSmsInput
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
        "sendSms",

      callId:
        input.callId,

      durationMs:
        0,

      error: {
        code:
          "IDEMPOTENCY_KEY_REQUIRED",

        message:
          "SMS requires a stable idempotency key.",
      },
    };
  }

  return executeBusinessTool({
    tool:
      "sendSms",

    callId:
      input.callId,

    input: {
      recipient:
        input.recipient,

      templateKey:
        input.templateKey,

      variables:
        input.variables,
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