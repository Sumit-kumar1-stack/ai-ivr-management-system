import {
  MessagingChannel,
  OutboundMessageStatus,
  Prisma,
} from "@prisma/client";

import {
  isWhatsAppDeploymentEnabled,
} from "@/config/communication-deployment-capabilities";

import {
  prisma,
} from "@/lib/prisma";

import {
  checkMessagingConsent,
} from "@/services/messaging/messaging-consent.service";

import {
  renderApprovedMessageTemplate,
} from "@/services/messaging/message-template.service";

import {
  resolveWhatsAppTemplate,
} from "@/services/messaging/whatsapp-template.service";

import {
  resolveMessagingProvider,
} from "@/services/messaging/messaging-provider-registry.service";

//--------------------------------------------------
// Template
//--------------------------------------------------

const CAMPAIGN_TEMPLATE_KEY =
  "LEAD_FOLLOW_UP" as const;

//--------------------------------------------------
// Input
//--------------------------------------------------

interface CampaignMessageInput {
  campaignId:
    string;

  recipientId:
    string;

  recipient:
    string;

  customerName:
    string | null;
}

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface CommunicationMessageDispatchResult {
  success:
    boolean;

  duplicate:
    boolean;

  outboundMessageId:
    string | null;

  code:
    string | null;

  message:
    string | null;
}

//--------------------------------------------------
// SMS
//--------------------------------------------------

export async function dispatchCommunicationSms(
  input:
    CampaignMessageInput
): Promise<CommunicationMessageDispatchResult> {
  //------------------------------------------------
  // Consent
  //------------------------------------------------

  const consent =
    await checkMessagingConsent(
      input.recipient,
      MessagingChannel.SMS
    );

  if (
    !consent.allowed
  ) {
    return {
      success:
        false,

      duplicate:
        false,

      outboundMessageId:
        null,

      code:
        "SMS_CONSENT_REQUIRED",

      message:
        consent.reason ??
        "SMS consent is required.",
    };
  }

  //------------------------------------------------
  // Provider Resolution
  //------------------------------------------------

  const adapter =
    resolveMessagingProvider({
      channel:
        "SMS",

      capability:
        "SMS_OUTBOUND",
    });

  if (
    !adapter ||
    !adapter.isConfigured()
  ) {
    return {
      success:
        false,

      duplicate:
        false,

      outboundMessageId:
        null,

      code:
        "SMS_PROVIDER_NOT_CONFIGURED",

      message:
        "No configured SMS messaging provider is available.",
    };
  }

  //------------------------------------------------
  // Idempotency
  //------------------------------------------------

  const idempotencyKey =
    `communication:${input.campaignId}:${input.recipientId}:SMS:${CAMPAIGN_TEMPLATE_KEY}`;

  const reservation =
    await reserveMessage({
      campaignId:
        input.campaignId,

      recipientId:
        input.recipientId,

      channel:
        MessagingChannel.SMS,

      provider:
        adapter.provider,

      recipient:
        input.recipient,

      idempotencyKey,
    });

  if (
    !reservation.created
  ) {
    return resultFromExisting(
      reservation.message
    );
  }

  //------------------------------------------------
  // Render
  //------------------------------------------------

  const body =
    renderApprovedMessageTemplate(
      CAMPAIGN_TEMPLATE_KEY,
      {
        customerName:
          input.customerName ??
          undefined,

        businessName:
          process.env
            .MESSAGING_BUSINESS_NAME
            ?.trim() ||
          "our team",
      }
    );

  //------------------------------------------------
  // Dispatch
  //------------------------------------------------

  const providerResult =
    await adapter.send({
      channel:
        "SMS",

      recipient:
        input.recipient,

      body,

      statusCallbackUrl:
        buildSmsStatusCallbackUrl(
          reservation.message.id
        ),
    });

  if (
    !providerResult.success
  ) {
    await markFailed(
      reservation.message.id,
      providerResult.code,
      providerResult.message
    );

    return {
      success:
        false,

      duplicate:
        false,

      outboundMessageId:
        reservation.message.id,

      code:
        providerResult.code,

      message:
        providerResult.message,
    };
  }

  const updated =
    await prisma
      .outboundMessage
      .update({
        where: {
          id:
            reservation.message.id,
        },

        data: {
          providerMessageId:
            providerResult.providerMessageId,

          status:
            mapSmsInitialStatus(
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

  return {
    success:
      true,

    duplicate:
      false,

    outboundMessageId:
      updated.id,

    code:
      null,

    message:
      null,
  };
}

//--------------------------------------------------
// WhatsApp
//--------------------------------------------------

export async function dispatchCommunicationWhatsApp(
  input:
    CampaignMessageInput
): Promise<CommunicationMessageDispatchResult> {
  //------------------------------------------------
  // Deployment Availability
  //------------------------------------------------

  if (
    !isWhatsAppDeploymentEnabled()
  ) {
    return {
      success:
        false,

      duplicate:
        false,

      outboundMessageId:
        null,

      code:
        "WHATSAPP_PROVIDER_DISABLED",

      message:
        "WhatsApp is not enabled for this deployment.",
    };
  }

  //------------------------------------------------
  // Consent
  //------------------------------------------------

  const consent =
    await checkMessagingConsent(
      input.recipient,
      MessagingChannel.WHATSAPP
    );

  if (
    !consent.allowed
  ) {
    return {
      success:
        false,

      duplicate:
        false,

      outboundMessageId:
        null,

      code:
        "WHATSAPP_CONSENT_REQUIRED",

      message:
        consent.reason ??
        "WhatsApp consent is required.",
    };
  }

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
    return {
      success:
        false,

      duplicate:
        false,

      outboundMessageId:
        null,

      code:
        "WHATSAPP_PROVIDER_NOT_CONFIGURED",

      message:
        "No configured WhatsApp messaging provider is available.",
    };
  }

  //------------------------------------------------
  // Idempotency
  //------------------------------------------------

  const idempotencyKey =
    `communication:${input.campaignId}:${input.recipientId}:WHATSAPP:${CAMPAIGN_TEMPLATE_KEY}`;

  const reservation =
    await reserveMessage({
      campaignId:
        input.campaignId,

      recipientId:
        input.recipientId,

      channel:
        MessagingChannel.WHATSAPP,

      provider:
        adapter.provider,

      recipient:
        input.recipient,

      idempotencyKey,
    });

  if (
    !reservation.created
  ) {
    return resultFromExisting(
      reservation.message
    );
  }

  //------------------------------------------------
  // Template
  //------------------------------------------------

  const template =
    resolveWhatsAppTemplate(
      CAMPAIGN_TEMPLATE_KEY,
      {
        customerName:
          input.customerName ??
          undefined,

        businessName:
          process.env
            .MESSAGING_BUSINESS_NAME
            ?.trim() ||
          "our team",
      }
    );

  //------------------------------------------------
  // Dispatch
  //------------------------------------------------

  const providerResult =
    await adapter.send({
      channel:
        "WHATSAPP",

      recipient:
        input.recipient,

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
    });

  if (
    !providerResult.success
  ) {
    await markFailed(
      reservation.message.id,
      providerResult.code,
      providerResult.message
    );

    return {
      success:
        false,

      duplicate:
        false,

      outboundMessageId:
        reservation.message.id,

      code:
        providerResult.code,

      message:
        providerResult.message,
    };
  }

  const updated =
    await prisma
      .outboundMessage
      .update({
        where: {
          id:
            reservation.message.id,
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

  return {
    success:
      true,

    duplicate:
      false,

    outboundMessageId:
      updated.id,

    code:
      null,

    message:
      null,
  };
}

//--------------------------------------------------
// Reserve Durable Message
//--------------------------------------------------

async function reserveMessage(
  input: {
    campaignId:
      string;

    recipientId:
      string;

    channel:
      MessagingChannel;

    provider:
      string;

    recipient:
      string;

    idempotencyKey:
      string;
  }
) {
  const existing =
    await prisma
      .outboundMessage
      .findUnique({
        where: {
          idempotencyKey:
            input.idempotencyKey,
        },
      });

  if (
    existing
  ) {
    return {
      created:
        false,

      message:
        existing,
    };
  }

  try {
    const message =
      await prisma
        .outboundMessage
        .create({
          data: {
            callId:
              null,

            communicationCampaignId:
              input.campaignId,

            communicationRecipientId:
              input.recipientId,

            channel:
              input.channel,

            provider:
              input.provider,

            recipient:
              input.recipient,

            templateKey:
              CAMPAIGN_TEMPLATE_KEY,

            idempotencyKey:
              input.idempotencyKey,

            status:
              OutboundMessageStatus.PROCESSING,
          },
        });

    return {
      created:
        true,

      message,
    };
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
              idempotencyKey:
                input.idempotencyKey,
            },
          });

      if (
        duplicate
      ) {
        return {
          created:
            false,

          message:
            duplicate,
        };
      }
    }

    throw error;
  }
}

//--------------------------------------------------
// Existing Result
//--------------------------------------------------

function resultFromExisting(
  message: {
    id:
      string;

    status:
      OutboundMessageStatus;

    errorCode:
      string | null;

    errorMessage:
      string | null;
  }
): CommunicationMessageDispatchResult {
  const failed =
    message.status ===
      OutboundMessageStatus.FAILED ||
    message.status ===
      OutboundMessageStatus.UNDELIVERED;

  return {
    success:
      !failed,

    duplicate:
      true,

    outboundMessageId:
      message.id,

    code:
      failed
        ? message.errorCode ??
          "MESSAGE_ALREADY_FAILED"
        : null,

    message:
      failed
        ? message.errorMessage ??
          "Message previously failed."
        : null,
  };
}

//--------------------------------------------------
// Failure
//--------------------------------------------------

async function markFailed(
  id:
    string,

  errorCode:
    string,

  errorMessage:
    string
): Promise<void> {
  await prisma
    .outboundMessage
    .updateMany({
      where: {
        id,

        status:
          OutboundMessageStatus.PROCESSING,
      },

      data: {
        status:
          OutboundMessageStatus.FAILED,

        errorCode,

        errorMessage:
          errorMessage
            .slice(
              0,
              500
            ),

        failedAt:
          new Date(),
      },
    });
}

//--------------------------------------------------
// SMS Status
//--------------------------------------------------

function mapSmsInitialStatus(
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
// Twilio Callback
//--------------------------------------------------

function buildSmsStatusCallbackUrl(
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