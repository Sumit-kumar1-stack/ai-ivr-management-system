import {
  executeBusinessTool,
} from "./tool-gateway.service";

import type {
  ToolExecutionResult,
} from "./tool-gateway.types";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface RequestConsentInput {
  callId:
    string;

  phone:
    string;

  channel:
    "SMS" |
    "WHATSAPP";

  status:
    "OPTED_IN" |
    "OPTED_OUT";

  source:
    string;

  evidenceText?:
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

export async function requestConsentRecord(
  input:
    RequestConsentInput
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
        "recordConsent",

      callId:
        input.callId,

      durationMs:
        0,

      error: {
        code:
          "IDEMPOTENCY_KEY_REQUIRED",

        message:
          "Consent recording requires a stable idempotency key.",
      },
    };
  }

  return executeBusinessTool({
    tool:
      "recordConsent",

    callId:
      input.callId,

    input: {
      phone:
        input.phone,

      channel:
        input.channel,

      status:
        input.status,

      source:
        input.source,

      evidenceText:
        input.evidenceText,
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