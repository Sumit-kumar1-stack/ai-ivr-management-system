import {
  z,
} from "zod";

import {
  endProviderCall,
} from "@/services/telephony/end-call.service";

import type {
  BusinessToolDefinition,
  ToolExecutionContext,
} from "./tool-gateway.types";

//--------------------------------------------------
// Schema
//--------------------------------------------------

export const endCallInputSchema =
  z.object({
    reason:
      z
        .string()
        .trim()
        .max(
          500
        )
        .optional(),
  });

//--------------------------------------------------
// Tool
//--------------------------------------------------

export const endCallTool:
  BusinessToolDefinition =
{
  name:
    "endCall",

  description:
    "Ends the active telephony call after an explicit confirmed end-call request.",

  risk:
    "SENSITIVE",

  mutating:
    true,

  requiresConfirmation:
    true,

  timeoutMs:
    8000,

  inputSchema:
    endCallInputSchema,

  handler:
    async (
      rawInput,
      context
    ) => {
      const input =
        endCallInputSchema.parse(
          rawInput
        );

      return executeEndCall(
        input,
        context
      );
    },
};

//--------------------------------------------------
// Execute
//--------------------------------------------------

async function executeEndCall(
  input:
    z.infer<
      typeof endCallInputSchema
    >,

  context:
    ToolExecutionContext
) {
  //------------------------------------------------
  // Abort
  //------------------------------------------------

  if (
    context.signal.aborted
  ) {
    throw new Error(
      "End-call operation was cancelled"
    );
  }

  //------------------------------------------------
  // Provider
  //------------------------------------------------

  const result =
    await endProviderCall(
      context.callId
    );

  if (
    !result.success
  ) {
    throw new Error(
      `${result.code ?? "END_CALL_FAILED"}: ${result.message}`
    );
  }

  return {
    ended:
      true,

    alreadyEnded:
      result.alreadyEnded,

    providerCallId:
      result.providerCallId,

    reason:
      input.reason ??
      null,

    message:
      result.message,
  };
}