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

export interface RequestLeadCreationInput {
  callId:
    string;

  fullName?:
    string;

  phone?:
    string;

  email?:
    string;

  interest:
    string;

  notes?:
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
// Create Lead
//--------------------------------------------------

export async function requestLeadCreation(
  input:
    RequestLeadCreationInput
): Promise<ToolExecutionResult> {
  const idempotencyKey =
    input
      .idempotencyKey
      ?.trim() ||
    [
      "lead",
      input.callId,
      randomUUID(),
    ].join(
      ":"
    );

  return executeBusinessTool({
    tool:
      "createLead",

    callId:
      input.callId,

    input: {
      fullName:
        input.fullName,

      phone:
        input.phone,

      email:
        input.email,

      interest:
        input.interest,

      notes:
        input.notes,
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