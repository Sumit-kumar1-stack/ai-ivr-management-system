import {
  MessagingChannel,
  OutboundMessageStatus,
  Prisma,
} from "@prisma/client";

import {
  z,
} from "zod";

import {
  prisma,
} from "@/lib/prisma";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  checkMessagingConsent,
  normalizeMessagingPhoneNumber,
} from "@/services/messaging/messaging-consent.service";

import {
  resolveWhatsAppTemplate,
} from "@/services/messaging/whatsapp-template.service";

import type {
  ApprovedWhatsAppTemplateKey,
} from "@/services/messaging/whatsapp-template.service";

import {
  resolveMessagingProvider,
} from "@/services/messaging/messaging-provider-registry.service";

import type {
  BusinessToolDefinition,
  ToolExecutionContext,
} from "./tool-gateway.types";

//--------------------------------------------------
// Schema
//--------------------------------------------------

export const sendWhatsAppInputSchema =
  z.object({
    recipient:
      z
        .string()
        .trim()
        .min(
          1
        ),

    templateKey:
      z.enum([
        "CALLBACK_CONFIRMATION",
        "LEAD_FOLLOW_UP",
        "HUMAN_TRANSFER_UNAVAILABLE",
      ]),

    variables:
      z
        .object({
          customerName:
            z
              .string()
              .trim()
              .max(
                200
              )
              .optional(),

          callbackTime:
            z
              .string()
              .trim()
              .max(
                200
              )
              .optional(),

          businessName:
            z
              .string()
              .trim()
              .max(
                200
              )
              .optional(),
        })
        .default({}),
  });

//--------------------------------------------------
// Tool
//--------------------------------------------------

export const sendWhatsAppTool:
  BusinessToolDefinition =
{
  name:
    "sendWhatsApp",

  description:
    "Sends an approved WhatsApp template to a consented recipient.",

  risk:
    "SENSITIVE",

  mutating:
    true,

  requiresConfirmation:
    true,

  timeoutMs:
    10000,

  inputSchema:
    sendWhatsAppInputSchema,

  handler:
    async (
      rawInput,
      context
    ) => {
      const input =
        sendWhatsAppInputSchema.parse(
          rawInput
        );

      return executeWhatsApp(
        input,
        context
      );
    },
};

//--------------------------------------------------
// Execute
//--------------------------------------------------

async function executeWhatsApp(
  input:
    z.infer<
      typeof sendWhatsAppInputSchema
    >,

  context:
    ToolExecutionContext
) {
  const log =
    createCallLogger(
      context.callId
    );

  //------------------------------------------------
  // Idempotency
  //------------------------------------------------

  const idempotencyKey =
    context
      .idempotencyKey
      ?.trim();

  if (
    !idempotencyKey
  ) {
    throw new Error(
      "WhatsApp idempotency key is required"
    );
  }

  //------------------------------------------------
  // Recipient
  //------------------------------------------------

  const recipient =
    normalizeMessagingPhoneNumber(
      input.recipient
    );

  if (
    !recipient
  ) {
    throw new Error(
      "WhatsApp recipient phone number is invalid"
    );
  }

  //------------------------------------------------
  // Consent
  //------------------------------------------------

  const consent =
    await checkMessagingConsent(
      recipient,
      MessagingChannel.WHATSAPP
    );

  if (
    !consent.allowed
  ) {
    throw new Error(
      `WHATSAPP_CONSENT_REQUIRED: ${consent.reason}`
    );
  }

  //------------------------------------------------
  // Existing
  //------------------------------------------------

  const existing =
    await prisma
      .outboundMessage
      .findUnique({
        where: {
          idempotencyKey,
        },
      });

  if (
    existing
  ) {
    if (
      existing.callId &&
      existing.callId !==
        context.callId
    ) {
      throw new Error(
        "WhatsApp idempotency key belongs to another call"
      );
    }

    return {
      outboundMessageId:
        existing.id,

      providerMessageId:
        existing.providerMessageId,

      status:
        existing.status,

      duplicate:
        true,
    };
  }

  //------------------------------------------------
  // Approved Template
  //------------------------------------------------

  const template =
    resolveWhatsAppTemplate(
      input.templateKey as
        ApprovedWhatsAppTemplateKey,
      input.variables
    );

  //------------------------------------------------
  // Provider Resolution
  //------------------------------------------------

  const adapter =
    resolveMessagingProvider({
      channel:
        "WHATSAPP",

      capability:
        "WHATSAPP_OUTBOUND",
    });

  if (
    !adapter ||
    !adapter.isConfigured()
  ) {
    throw new Error(
      "WHATSAPP_PROVIDER_NOT_CONFIGURED: No configured WhatsApp messaging provider is available"
    );
  }

  //------------------------------------------------
  // Reserve Idempotency
  //------------------------------------------------

  let record;

  try {
    record =
      await prisma
        .outboundMessage
        .create({
          data: {
            callId:
              context.callId,

            channel:
              MessagingChannel.WHATSAPP,

            provider:
              adapter.provider,

            recipient,

            templateKey:
              input.templateKey,

            idempotencyKey,

            status:
              OutboundMessageStatus.PROCESSING,
          },
        });
  } catch (
    error
  ) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code ===
        "P2002"
    ) {
      const duplicate =
        await prisma
          .outboundMessage
          .findUnique({
            where: {
              idempotencyKey,
            },
          });

      if (
        duplicate
      ) {
        return {
          outboundMessageId:
            duplicate.id,

          providerMessageId:
            duplicate.providerMessageId,

          status:
            duplicate.status,

          duplicate:
            true,
        };
      }
    }

    throw error;
  }

  //------------------------------------------------
  // Abort
  //------------------------------------------------

  if (
    context.signal.aborted
  ) {
    await prisma
      .outboundMessage
      .update({
        where: {
          id:
            record.id,
        },

        data: {
          status:
            OutboundMessageStatus.FAILED,

          errorCode:
            "MESSAGE_ABORTED",

          errorMessage:
            "WhatsApp dispatch was cancelled.",

          failedAt:
            new Date(),
        },
      });

    throw new Error(
      "WhatsApp dispatch was cancelled"
    );
  }

  //------------------------------------------------
  // Provider
  //------------------------------------------------

  try {
    const providerResult =
      await adapter.send({
        channel:
          "WHATSAPP",

        recipient,

        templateName:
          template.name,

        templateLanguage:
          template.language,

        templateComponents: [
          {
            type:
              "body",

            parameters:
              template
                .bodyParameters
                .map(
                  text => ({
                    type:
                      "text" as const,

                    text,
                  })
                ),
          },
        ],

        signal:
          context.signal,
      });

    //------------------------------------------------
    // Rejected
    //------------------------------------------------

    if (
      !providerResult.success
    ) {
      await prisma
        .outboundMessage
        .update({
          where: {
            id:
              record.id,
          },

          data: {
            status:
              OutboundMessageStatus.FAILED,

            errorCode:
              providerResult.code,

            errorMessage:
              providerResult.message,

            failedAt:
              new Date(),
          },
        });

      throw new Error(
        `${providerResult.code}: ${providerResult.message}`
      );
    }

    //------------------------------------------------
    // Accepted
    //------------------------------------------------

    const updated =
      await prisma
        .outboundMessage
        .update({
          where: {
            id:
              record.id,
          },

          data: {
            providerMessageId:
              providerResult.providerMessageId,

            status:
              OutboundMessageStatus.ACCEPTED,

            acceptedAt:
              new Date(),

            errorCode:
              null,

            errorMessage:
              null,
          },
        });

    log.info(
      {
        event:
          "whatsapp.tool.completed",

        outboundMessageId:
          updated.id,

        providerMessageId:
          updated.providerMessageId,

        templateKey:
          updated.templateKey,
      },
      "WhatsApp message accepted through Tool Gateway"
    );

    return {
      outboundMessageId:
        updated.id,

      providerMessageId:
        updated.providerMessageId,

      status:
        updated.status,

      duplicate:
        false,
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "whatsapp.tool.failed",

        outboundMessageId:
          record.id,

        error:
          normalizeError(
            error
          ),
      },
      "WhatsApp Tool Gateway execution failed"
    );

    throw error;
  }
}