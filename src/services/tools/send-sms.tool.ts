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
  renderApprovedMessageTemplate,
} from "@/services/messaging/message-template.service";

import type {
  ApprovedMessageTemplateKey,
} from "@/services/messaging/message-template.service";

import {
  sendMessage,
} from "@/services/messaging/messaging.service";

import type {
  BusinessToolDefinition,
  ToolExecutionContext,
} from "./tool-gateway.types";

//--------------------------------------------------
// Schema
//--------------------------------------------------

export const sendSmsInputSchema =
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

export const sendSmsTool:
  BusinessToolDefinition =
{
  name:
    "sendSms",

  description:
    "Sends an approved SMS template to a consented recipient.",

  risk:
    "SENSITIVE",

  mutating:
    true,

  requiresConfirmation:
    true,

  timeoutMs:
    10000,

  inputSchema:
    sendSmsInputSchema,

  handler:
    async (
      rawInput,
      context
    ) => {
      const input =
        sendSmsInputSchema.parse(
          rawInput
        );

      return executeSms(
        input,
        context
      );
    },
};

//--------------------------------------------------
// Execute
//--------------------------------------------------

async function executeSms(
  input:
    z.infer<
      typeof sendSmsInputSchema
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
      "SMS idempotency key is required"
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
      "SMS recipient phone number is invalid"
    );
  }

  //------------------------------------------------
  // Consent
  //------------------------------------------------

  const consent =
    await checkMessagingConsent(
      recipient,
      MessagingChannel.SMS
    );

  if (
    !consent.allowed
  ) {
    throw new Error(
      `SMS_CONSENT_REQUIRED: ${consent.reason}`
    );
  }

  //------------------------------------------------
  // Existing Message
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
        "SMS idempotency key belongs to another call"
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
  // Render Approved Template
  //------------------------------------------------

  const body =
    renderApprovedMessageTemplate(
      input.templateKey as
        ApprovedMessageTemplateKey,
      input.variables
    );

  //------------------------------------------------
  // Reserve Idempotency Before Provider Call
  //------------------------------------------------

  let messageRecord;

  try {
    messageRecord =
      await prisma
        .outboundMessage
        .create({
          data: {
            callId:
              context.callId,

            channel:
              MessagingChannel.SMS,

            provider:
              "TWILIO",

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
  // Abort Before External Side Effect
  //------------------------------------------------

  if (
    context.signal.aborted
  ) {
    await prisma
      .outboundMessage
      .update({
        where: {
          id:
            messageRecord.id,
        },

        data: {
          status:
            OutboundMessageStatus.FAILED,

          errorCode:
            "MESSAGE_ABORTED",

          errorMessage:
            "SMS dispatch was cancelled.",

          failedAt:
            new Date(),
        },
      });

    throw new Error(
      "SMS dispatch was cancelled"
    );
  }

  //------------------------------------------------
  // Status Callback
  //------------------------------------------------

  const statusCallbackUrl =
    buildStatusCallbackUrl(
      messageRecord.id
    );

  //------------------------------------------------
  // Provider
  //------------------------------------------------

  try {
    const providerResult =
      await sendMessage(
        "TWILIO",
        {
          channel:
            "SMS",

          recipient,

          body,

          statusCallbackUrl,

          signal:
            context.signal,
        }
      );

    //------------------------------------------------
    // Provider Rejected
    //------------------------------------------------

    if (
      !providerResult.success
    ) {
      await prisma
        .outboundMessage
        .update({
          where: {
            id:
              messageRecord.id,
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
    // Provider Accepted
    //------------------------------------------------

    const updated =
      await prisma
        .outboundMessage
        .update({
          where: {
            id:
              messageRecord.id,
          },

          data: {
            providerMessageId:
              providerResult.providerMessageId,

            status:
              mapInitialStatus(
                providerResult.status
              ),

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
          "sms.tool.completed",

        outboundMessageId:
          updated.id,

        providerMessageId:
          updated.providerMessageId,

        status:
          updated.status,

        templateKey:
          updated.templateKey,
      },
      "SMS accepted through Tool Gateway"
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
          "sms.tool.failed",

        outboundMessageId:
          messageRecord.id,

        error:
          normalizeError(
            error
          ),
      },
      "SMS Tool Gateway execution failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Initial Status
//--------------------------------------------------

function mapInitialStatus(
  value:
    string
): OutboundMessageStatus {
  switch (
    value
      .trim()
      .toLowerCase()
  ) {
    case "queued":
      return OutboundMessageStatus.QUEUED;

    case "sent":
      return OutboundMessageStatus.SENT;

    case "delivered":
      return OutboundMessageStatus.DELIVERED;

    case "failed":
      return OutboundMessageStatus.FAILED;

    case "undelivered":
      return OutboundMessageStatus.UNDELIVERED;

    default:
      return OutboundMessageStatus.ACCEPTED;
  }
}

//--------------------------------------------------
// Status Callback URL
//--------------------------------------------------

function buildStatusCallbackUrl(
  outboundMessageId:
    string
): string | undefined {
  const baseUrl =
    (
      process.env
        .TWILIO_PUBLIC_BASE_URL ??
      process.env
        .APP_URL
    )
      ?.trim()
      .replace(
        /\/+$/,
        ""
      );

  if (
    !baseUrl
  ) {
    return undefined;
  }

  return (
    `${baseUrl}/api/twilio/messaging/status` +
    `?messageId=${encodeURIComponent(
      outboundMessageId
    )}`
  );
}