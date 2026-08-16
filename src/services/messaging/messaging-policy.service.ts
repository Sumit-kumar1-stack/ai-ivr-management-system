import {
  MessageConsentStatus,
  MessagingChannel,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  normalizeMessagingPhoneNumber,
} from "./messaging-consent.service";

//--------------------------------------------------
// Supported Transactional Channels
//--------------------------------------------------

export type TransactionalMessagingChannel =
  | "SMS"
  | "WHATSAPP";

//--------------------------------------------------
// Policy Result
//--------------------------------------------------

export interface MessagingChannelDecision {
  allowed:
    boolean;

  phone:
    string | null;

  channel:
    TransactionalMessagingChannel | null;

  reason:
    string | null;
}

//--------------------------------------------------
// Resolve Preferred Allowed Channel
//--------------------------------------------------

export async function resolveMessagingChannel(
  phone:
    string
): Promise<MessagingChannelDecision> {
  const normalizedPhone =
    normalizeMessagingPhoneNumber(
      phone
    );

  if (
    !normalizedPhone
  ) {
    return {
      allowed:
        false,

      phone:
        null,

      channel:
        null,

      reason:
        "Recipient phone number is invalid.",
    };
  }

  //------------------------------------------------
  // Load Consent Once
  //------------------------------------------------

  const consents =
    await prisma
      .messageConsent
      .findMany({
        where: {
          phone:
            normalizedPhone,

          channel: {
            in: [
              MessagingChannel.SMS,
              MessagingChannel.WHATSAPP,
            ],
          },
        },

        select: {
          channel:
            true,

          status:
            true,
        },
      });

  //------------------------------------------------
  // Build Consent Map
  //------------------------------------------------

  const statusByChannel =
    new Map<
      MessagingChannel,
      MessageConsentStatus
    >();

  for (
    const consent of consents
  ) {
    statusByChannel.set(
      consent.channel,
      consent.status
    );
  }

  //------------------------------------------------
  // Priority
  //------------------------------------------------

  const priority =
    resolveChannelPriority();

  //------------------------------------------------
  // First Explicitly Opted-In Channel Wins
  //------------------------------------------------

  for (
    const channel of priority
  ) {
    const prismaChannel =
      channel ===
      "WHATSAPP"
        ? MessagingChannel.WHATSAPP
        : MessagingChannel.SMS;

    if (
      statusByChannel.get(
        prismaChannel
      ) ===
      MessageConsentStatus.OPTED_IN
    ) {
      return {
        allowed:
          true,

        phone:
          normalizedPhone,

        channel,

        reason:
          null,
      };
    }
  }

  //------------------------------------------------
  // No Allowed Channel
  //------------------------------------------------

  const optedOutSms =
    statusByChannel.get(
      MessagingChannel.SMS
    ) ===
    MessageConsentStatus.OPTED_OUT;

  const optedOutWhatsApp =
    statusByChannel.get(
      MessagingChannel.WHATSAPP
    ) ===
    MessageConsentStatus.OPTED_OUT;

  if (
    optedOutSms &&
    optedOutWhatsApp
  ) {
    return {
      allowed:
        false,

      phone:
        normalizedPhone,

      channel:
        null,

      reason:
        "Recipient has opted out of SMS and WhatsApp.",
    };
  }

  return {
    allowed:
      false,

    phone:
      normalizedPhone,

    channel:
      null,

    reason:
      "No messaging channel has explicit opt-in consent.",
  };
}

//--------------------------------------------------
// Channel Priority
//--------------------------------------------------

function resolveChannelPriority():
  TransactionalMessagingChannel[] {
  const configured =
    process.env
      .MESSAGING_CHANNEL_PRIORITY
      ?.split(
        ","
      )
      .map(
        value =>
          value
            .trim()
            .toUpperCase()
      )
      .filter(
        (
          value
        ): value is TransactionalMessagingChannel =>
          value ===
            "SMS" ||
          value ===
            "WHATSAPP"
      ) ??
    [];

  //------------------------------------------------
  // Remove Duplicates
  //------------------------------------------------

  const unique =
    [
      ...new Set(
        configured
      ),
    ];

  if (
    unique.length >
    0
  ) {
    return unique;
  }

  /*
   * Default:
   *
   * Prefer WhatsApp when explicit consent exists.
   * Fall back to SMS when it does not.
   */
  return [
    "WHATSAPP",
    "SMS",
  ];
}