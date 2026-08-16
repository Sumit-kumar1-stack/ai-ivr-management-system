import {
  MessagingChannel,
} from "@prisma/client";

import {
  z,
} from "zod";

import {
  prisma,
} from "@/lib/prisma";

import {
  recordMessagingConsent,
} from "@/services/messaging/messaging-consent.service";

import type {
  BusinessToolDefinition,
  ToolExecutionContext,
} from "./tool-gateway.types";

//--------------------------------------------------
// Schema
//--------------------------------------------------

export const recordConsentInputSchema =
  z.object({
    phone:
      z
        .string()
        .trim()
        .min(
          1
        ),

    channel:
      z.enum([
        "SMS",
        "WHATSAPP",
      ]),

    status:
      z.enum([
        "OPTED_IN",
        "OPTED_OUT",
      ]),

    source:
      z
        .string()
        .trim()
        .min(
          1
        )
        .max(
          200
        ),

    evidenceText:
      z
        .string()
        .trim()
        .max(
          1000
        )
        .optional(),
  });

//--------------------------------------------------
// Tool
//--------------------------------------------------

export const recordConsentTool:
  BusinessToolDefinition =
{
  name:
    "recordConsent",

  description:
    "Records explicit messaging consent or revocation with durable evidence.",

  risk:
    "SENSITIVE",

  mutating:
    true,

  requiresConfirmation:
    true,

  timeoutMs:
    5000,

  inputSchema:
    recordConsentInputSchema,

  handler:
    async (
      rawInput,
      context
    ) => {
      const input =
        recordConsentInputSchema.parse(
          rawInput
        );

      return executeRecordConsent(
        input,
        context
      );
    },
};

//--------------------------------------------------
// Execute
//--------------------------------------------------

async function executeRecordConsent(
  input:
    z.infer<
      typeof recordConsentInputSchema
    >,

  context:
    ToolExecutionContext
) {
  //------------------------------------------------
  // Stable Idempotency Required
  //------------------------------------------------

  const idempotencyKey =
    context
      .idempotencyKey
      ?.trim();

  if (
    !idempotencyKey
  ) {
    throw new Error(
      "Consent recording requires a stable idempotency key"
    );
  }

  //------------------------------------------------
  // Verify Call
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
      },
    });

  if (
    !call
  ) {
    throw new Error(
      `Call not found: ${context.callId}`
    );
  }

  //------------------------------------------------
  // Persist Through Consent Service
  //------------------------------------------------

  const result =
    await recordMessagingConsent({
      phone:
        input.phone,

      channel:
        input.channel ===
          "WHATSAPP"
          ? MessagingChannel.WHATSAPP
          : MessagingChannel.SMS,

      status:
        input.status,

      source:
        input.source,

      callId:
        context.callId,

      requestedBy:
        context.requestedBy,

      evidenceText:
        input.evidenceText,

      idempotencyKey,
    });

  return {
    phone:
      result.phone,

    channel:
      result.channel,

    status:
      result.status,

    evidenceId:
      result.evidenceId,

    duplicate:
      result.duplicate,
  };
}