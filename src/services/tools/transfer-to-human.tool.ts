import {
  z,
} from "zod";

import {
  prisma,
} from "@/lib/prisma";

import {
  transferHumanCall,
} from "@/services/telephony/human-transfer.service";

import type {
  HumanTransferProvider,
  HumanTransferStrategy,
} from "@/services/telephony/human-transfer.types";

import type {
  BusinessToolDefinition,
  ToolExecutionContext,
} from "./tool-gateway.types";

//--------------------------------------------------
// Schema
//--------------------------------------------------

export const transferToHumanInputSchema =
  z.object({
    destination:
      z
        .string()
        .trim()
        .min(
          1,
          "Transfer destination is required"
        )
        .max(
          200
        ),

    strategy:
      z
        .enum([
          "DIRECT_NUMBER",
          "QUEUE",
          "SIP",
        ])
        .default(
          "DIRECT_NUMBER"
        ),

    reason:
      z
        .string()
        .trim()
        .max(
          500
        )
        .optional(),

    announcement:
      z
        .string()
        .trim()
        .max(
          500
        )
        .optional(),

    timeoutSeconds:
      z
        .number()
        .int()
        .min(
          5
        )
        .max(
          120
        )
        .optional(),
  });

//--------------------------------------------------
// Tool
//--------------------------------------------------

export const transferToHumanTool:
  BusinessToolDefinition =
{
  name:
    "transferToHuman",

  description:
    "Transfers the current active call to an approved human-agent destination.",

  risk:
    "SENSITIVE",

  mutating:
    true,

  requiresConfirmation:
    true,

  timeoutMs:
    10000,

  inputSchema:
    transferToHumanInputSchema,

  handler:
    async (
      rawInput,
      context
    ) => {
      const input =
        transferToHumanInputSchema.parse(
          rawInput
        );

      return executeTransfer(
        input,
        context
      );
    },
};

//--------------------------------------------------
// Execute Transfer
//--------------------------------------------------

async function executeTransfer(
  input:
    z.infer<
      typeof transferToHumanInputSchema
    >,

  context:
    ToolExecutionContext
) {
  //------------------------------------------------
  // Load Current Call
  //------------------------------------------------

  const call =
    await prisma.call.findUnique({
      where: {
        id:
          context.callId,
      },

 select: {
  id:
    true,

 providerCallId:
    true,

  provider:
    true,

  status:
    true,
},
    });

  if (
    !call
  ) {
    throw new Error(
      `Call not found: ${context.callId}`
    );
  }

  if (
    !call.providerCallId
  ) {
    throw new Error(
      "Active provider call ID is unavailable"
    );
  }

  //------------------------------------------------
  // Resolve Provider
  //------------------------------------------------

const provider =
  resolveProvider(
    call.provider,
    call.providerCallId
  );

  if (
    !provider
  ) {
    throw new Error(
      "Current telephony provider does not support human transfer"
    );
  }

  //------------------------------------------------
  // Execute Through Provider-Neutral Layer
  //------------------------------------------------

  const result =
    await transferHumanCall({
      callId:
        call.id,

      providerCallId:
        call.providerCallId,

      provider,

      strategy:
        input.strategy as
          HumanTransferStrategy,

      destination:
        input.destination,

      reason:
        input.reason,

      announcement:
        input.announcement,

      timeoutSeconds:
        input.timeoutSeconds,

      signal:
        context.signal,
    });

  if (
    !result.success
  ) {
    throw new Error(
      `${result.code}: ${result.message}`
    );
  }

  return result;
}

//--------------------------------------------------
// Provider Resolution
//--------------------------------------------------

function resolveProvider(
  persistedProvider: string,
  providerCallId:
    string
): HumanTransferProvider | null {
const configured = persistedProvider.trim().toUpperCase();
  if (configured === "PLIVO") return "PLIVO";
  if (configured === "EXOTEL") return "EXOTEL";
  if (configured === "TWILIO") return "TWILIO";
  const normalized =
    providerCallId.trim();

  /*
   * Twilio Call SIDs always use the CA prefix.
   *
   * We resolve from the persisted provider identifier
   * instead of inventing a provider field on Call.
   */

  if (
    /^CA[a-fA-F0-9]{32}$/.test(
      normalized
    )
  ) {
    return "TWILIO";
  }

  return null;
}
