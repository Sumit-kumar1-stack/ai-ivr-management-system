import {
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationFallbackPolicy,
  CommunicationRecipientStatus,
  MessagingChannel,
  OutboundMessageStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  dispatchCommunicationSms,
} from "./communication-messaging-dispatch.service";

import {
  canUseCommunicationFallback,
} from "./communication-entitlement.service";

import {
  tryFinalizeCommunicationCampaign,
} from "./communication-campaign-finalizer.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface CommunicationFallbackResult {
  handled:
    boolean;

  sent:
    boolean;

  outboundMessageId:
    string | null;

  reason:
    string;
}

//--------------------------------------------------
// WhatsApp -> SMS
//--------------------------------------------------

export async function handleWhatsAppFailureFallback(
  outboundMessageId:
    string
): Promise<CommunicationFallbackResult> {
  const id =
    outboundMessageId
      .trim();

  if (
    !id
  ) {
    return skipped(
      "outbound_message_id_missing"
    );
  }

  //------------------------------------------------
  // Source Message
  //------------------------------------------------

  const message =
    await prisma
      .outboundMessage
      .findUnique({
        where: {
          id,
        },

        select: {
          id:
            true,

          channel:
            true,

          status:
            true,

          communicationCampaignId:
            true,

          communicationRecipientId:
            true,

communicationCampaign: {
  select: {
    id:
      true,

    tier:
      true,

    status:
      true,

    channels:
      true,

    fallbackPolicy:
      true,
  },
},

          communicationRecipient: {
            select: {
              id:
                true,

              campaignId:
                true,

              phone:
                true,

              fullName:
                true,

              status:
                true,
            },
          },
        },
      });

  if (
    !message
  ) {
    return skipped(
      "outbound_message_not_found"
    );
  }

  //------------------------------------------------
  // WhatsApp Only
  //------------------------------------------------

  if (
    message.channel !==
    MessagingChannel.WHATSAPP
  ) {
    return skipped(
      "source_message_is_not_whatsapp"
    );
  }

  //------------------------------------------------
  // Actual Terminal Failure Only
  //------------------------------------------------

  if (
    message.status !==
      OutboundMessageStatus.FAILED &&
    message.status !==
      OutboundMessageStatus.UNDELIVERED
  ) {
    return skipped(
      "whatsapp_message_is_not_failed"
    );
  }

  //------------------------------------------------
  // Parent Association
  //------------------------------------------------

  const campaign =
    message
      .communicationCampaign;

  const recipient =
    message
      .communicationRecipient;

  if (
    !campaign ||
    !recipient ||
    !message
      .communicationCampaignId ||
    !message
      .communicationRecipientId
  ) {
    return skipped(
      "message_is_not_a_communication_campaign_message"
    );
  }

  //------------------------------------------------
  // Ownership Guard
  //------------------------------------------------

  if (
    recipient.campaignId !==
    campaign.id
  ) {
    return skipped(
      "recipient_campaign_mismatch"
    );
  }

//------------------------------------------------
// Subscription Entitlement Guard
//------------------------------------------------

if (
  !canUseCommunicationFallback(
    campaign.tier
  )
) {
  return skipped(
    "fallback_not_entitled_for_subscription"
  );
}

//------------------------------------------------
// Policy Guard
//------------------------------------------------

if (
  campaign.fallbackPolicy !==
  CommunicationFallbackPolicy.WHATSAPP_TO_SMS
) {
    return skipped(
      "whatsapp_to_sms_policy_not_enabled"
    );
  }

  if (
    !campaign.channels
      .includes(
        CommunicationChannel.SMS
      )
  ) {
    return skipped(
      "sms_channel_not_selected"
    );
  }

  //------------------------------------------------
  // Do Not Create New Side Effects After
  // Cancellation / Terminal Campaign Failure
  //------------------------------------------------

  if (
    campaign.status ===
      CommunicationCampaignStatus.CANCELLED ||
    campaign.status ===
      CommunicationCampaignStatus.FAILED
  ) {
    return skipped(
      "communication_campaign_is_terminal"
    );
  }

  //------------------------------------------------
  // SMS
  //
  // dispatchCommunicationSms has its own durable
  // idempotency key, so repeated Meta callbacks or
  // repeated BullMQ jobs cannot normally produce a
  // second campaign SMS reservation.
  //------------------------------------------------

  const sms =
    await dispatchCommunicationSms({
      campaignId:
        campaign.id,

      recipientId:
        recipient.id,

      recipient:
        recipient.phone,

      customerName:
        recipient.fullName,
    });

  //------------------------------------------------
  // Accepted
  //------------------------------------------------

  if (
    sms.success
  ) {
    await prisma
      .communicationCampaignRecipient
      .updateMany({
        where: {
          id:
            recipient.id,

          campaignId:
            campaign.id,

          status: {
            in: [
              CommunicationRecipientStatus.PENDING,
              CommunicationRecipientStatus.PROCESSING,
              CommunicationRecipientStatus.DISPATCHED,
              CommunicationRecipientStatus.FAILED,
            ],
          },
        },

        data: {
          status:
            CommunicationRecipientStatus.DISPATCHED,

          lastError:
            null,
        },
      });

    await tryFinalizeCommunicationCampaign(
      campaign.id
    );

    return {
      handled:
        true,

      sent:
        true,

      outboundMessageId:
        sms.outboundMessageId,

      reason:
        sms.duplicate
          ? "sms_fallback_already_reserved"
          : "sms_fallback_dispatched",
    };
  }

  //------------------------------------------------
  // Failed
  //------------------------------------------------

  const failureText =
    `${sms.code ?? "SMS_FALLBACK_FAILED"}: ${sms.message ?? "SMS fallback failed"}`;

  await prisma
    .communicationCampaignRecipient
    .updateMany({
      where: {
        id:
          recipient.id,

        campaignId:
          campaign.id,

        status: {
          in: [
            CommunicationRecipientStatus.PENDING,
            CommunicationRecipientStatus.PROCESSING,
            CommunicationRecipientStatus.DISPATCHED,
            CommunicationRecipientStatus.FAILED,
          ],
        },
      },

      data: {
        status:
          CommunicationRecipientStatus.FAILED,

        lastError:
          failureText
            .slice(
              0,
              1000
            ),
      },
    });

  await tryFinalizeCommunicationCampaign(
    campaign.id
  );

  return {
    handled:
      true,

    sent:
      false,

    outboundMessageId:
      sms.outboundMessageId,

    reason:
      failureText,
  };
}

//--------------------------------------------------
// Skip
//--------------------------------------------------

function skipped(
  reason:
    string
): CommunicationFallbackResult {
  return {
    handled:
      false,

    sent:
      false,

    outboundMessageId:
      null,

    reason,
  };
}