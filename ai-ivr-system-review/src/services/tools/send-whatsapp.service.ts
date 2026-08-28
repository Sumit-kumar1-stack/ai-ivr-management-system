import {
  executeBusinessTool,
} from "./tool-gateway.service";

import type {
  ToolExecutionResult,
} from "./tool-gateway.types";

import type {
  ApprovedWhatsAppTemplateKey,
  WhatsAppTemplateVariables,
} from "@/services/messaging/whatsapp-template.service";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface RequestWhatsAppInput {
  callId:
    string;

  recipient:
    string;

  templateKey:
    ApprovedWhatsAppTemplateKey;

  variables:
    WhatsAppTemplateVariables;

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

export async function requestWhatsApp(
  input:
    RequestWhatsAppInput
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
        "sendWhatsApp",

      callId:
        input.callId,

      durationMs:
        0,

      error: {
        code:
          "IDEMPOTENCY_KEY_REQUIRED",

        message:
          "WhatsApp requires a stable idempotency key.",
      },
    };
  }

  return executeBusinessTool({
    tool:
      "sendWhatsApp",

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