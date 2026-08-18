import {
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationFallbackPolicy,
  CommunicationRecipientStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  dispatchCommunicationSms,
  dispatchCommunicationWhatsApp,
} from "./communication-messaging-dispatch.service";

import {
  startCommunicationVoiceRuntime,
} from "./communication-voice-runtime.service";

import {
  startCommunicationIvrCampaign,
} from "./communication-ivr-bridge.service";

import {
  assertCommunicationCampaignEntitlements,
} from "./communication-entitlement.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface RunCommunicationCampaignResult {
  communicationCampaignId:
    string;

  recipientCount:
    number;

  messagingAccepted:
    number;

  messagingFailed:
    number;

  smsDeferredForFallback:
    number;

  aiVoiceQueued:
    boolean;

  ivrQueued:
    boolean;

  voiceQueued:
    boolean;

  voiceCampaignId:
    string | null;

  ivrCampaignId:
    string | null;

  voiceErrors:
    string[];
}

//--------------------------------------------------
// Run
//--------------------------------------------------

export async function runCommunicationCampaign(
  communicationCampaignId:
    string
): Promise<RunCommunicationCampaignResult> {
  //------------------------------------------------
  // Claim
  //------------------------------------------------

  const claimed =
    await prisma
      .communicationCampaign
      .updateMany({
        where: {
          id:
            communicationCampaignId,

          status: {
            in: [
              CommunicationCampaignStatus.QUEUED,
              CommunicationCampaignStatus.SCHEDULED,
            ],
          },
        },

        data: {
          status:
            CommunicationCampaignStatus.RUNNING,
        },
      });

  //------------------------------------------------
  // Existing State
  //------------------------------------------------

  if (
    claimed.count ===
    0
  ) {
    const existing =
      await prisma
        .communicationCampaign
        .findUnique({
          where: {
            id:
              communicationCampaignId,
          },

          select: {
            status:
              true,
          },
        });

    if (
      !existing
    ) {
      throw new Error(
        "Communication campaign not found"
      );
    }

    //------------------------------------------------
    // Already Finished Initial Dispatch
    //------------------------------------------------

    if (
      existing.status ===
        CommunicationCampaignStatus.DISPATCHED ||
      existing.status ===
        CommunicationCampaignStatus.COMPLETED
    ) {
      return emptyResult(
        communicationCampaignId
      );
    }

    //------------------------------------------------
    // BullMQ Retry May Resume RUNNING
    //------------------------------------------------

    if (
      existing.status !==
      CommunicationCampaignStatus.RUNNING
    ) {
      throw new Error(
        `Communication campaign cannot execute while status is ${existing.status}`
      );
    }
  }

  //------------------------------------------------
  // Load
  //------------------------------------------------

  const campaign =
    await prisma
      .communicationCampaign
      .findUnique({
        where: {
          id:
            communicationCampaignId,
        },

        include: {
          recipients:
            true,
        },
      });

if (
  !campaign
) {
  throw new Error(
    "Communication campaign not found"
  );
}

//------------------------------------------------
// M10 — Runtime Entitlement Gate
//
// Never trust UI-only subscription enforcement.
// The campaign's persisted tier snapshot decides
// what this execution is allowed to do.
//------------------------------------------------

try {
  assertCommunicationCampaignEntitlements({
    tier:
      campaign.tier,

    channels:
      campaign.channels,

    smartChanneling:
      campaign
        .smartChanneling,

    fallbackPolicy:
      campaign
        .fallbackPolicy,

    recipientCount:
      campaign
        .recipients
        .length,
  });
} catch (
  error
) {
  //------------------------------------------------
  // Invalid entitlement must not leave RUNNING work.
  //------------------------------------------------

  await markCampaignFailed(
    campaign.id
  );

  throw error;
}

//------------------------------------------------
// Recipients
//------------------------------------------------
  if (
    campaign.recipients
      .length ===
    0
  ) {
    await markCampaignFailed(
      campaign.id
    );

    throw new Error(
      "Communication campaign has no recipient snapshots"
    );
  }

  //------------------------------------------------
  // Messaging Strategy
  //------------------------------------------------

  const sendWhatsApp =
    campaign.channels
      .includes(
        CommunicationChannel.WHATSAPP
      );

  const sendSms =
    campaign.channels
      .includes(
        CommunicationChannel.SMS
      );

  const deferSms =
    campaign.fallbackPolicy ===
      CommunicationFallbackPolicy.WHATSAPP_TO_SMS &&
    sendWhatsApp &&
    sendSms;

  let messagingAccepted =
    0;

  let messagingFailed =
    0;

  let smsDeferredForFallback =
    0;

  //------------------------------------------------
  // Messaging Recipients
  //------------------------------------------------

  for (
    const recipient
    of campaign.recipients
  ) {
    await prisma
      .communicationCampaignRecipient
      .update({
        where: {
          id:
            recipient.id,
        },

        data: {
          status:
            CommunicationRecipientStatus.PROCESSING,

          lastError:
            null,
        },
      });

    let attempted =
      0;

    let accepted =
      0;

    const errors:
      string[] =
        [];

    //------------------------------------------------
    // WhatsApp Primary
    //------------------------------------------------

    if (
      sendWhatsApp
    ) {
      attempted +=
        1;

      const result =
        await dispatchCommunicationWhatsApp({
          campaignId:
            campaign.id,

          recipientId:
            recipient.id,

          recipient:
            recipient.phone,

          customerName:
            recipient.fullName,
        });

      if (
        result.success
      ) {
        accepted +=
          1;

        messagingAccepted +=
          1;

        //------------------------------------------
        // Wait For Meta Delivery Failure Webhook
        //------------------------------------------

        if (
          deferSms
        ) {
          smsDeferredForFallback +=
            1;
        }
      } else {
        messagingFailed +=
          1;

        errors.push(
          `${result.code ?? "WHATSAPP_FAILED"}: ${result.message ?? "WhatsApp dispatch failed"}`
        );

        //------------------------------------------
        // WhatsApp Could Not Even Be Accepted.
        //
        // No Meta failure webhook may ever arrive,
        // therefore fallback must happen here.
        //------------------------------------------

        if (
          deferSms
        ) {
          attempted +=
            1;

          const fallback =
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

          if (
            fallback.success
          ) {
            accepted +=
              1;

            messagingAccepted +=
              1;
          } else {
            messagingFailed +=
              1;

            errors.push(
              `${fallback.code ?? "SMS_FALLBACK_FAILED"}: ${fallback.message ?? "SMS fallback failed"}`
            );
          }
        }
      }
    }

    //------------------------------------------------
    // Primary SMS
    //------------------------------------------------

    if (
      sendSms &&
      !deferSms
    ) {
      attempted +=
        1;

      const result =
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

      if (
        result.success
      ) {
        accepted +=
          1;

        messagingAccepted +=
          1;
      } else {
        messagingFailed +=
          1;

        errors.push(
          `${result.code ?? "SMS_FAILED"}: ${result.message ?? "SMS dispatch failed"}`
        );
      }
    }

    //------------------------------------------------
    // No Messaging Channel
    //------------------------------------------------

    if (
      attempted ===
      0
    ) {
      await prisma
        .communicationCampaignRecipient
        .update({
          where: {
            id:
              recipient.id,
          },

          data: {
            status:
              CommunicationRecipientStatus.PENDING,
          },
        });

      continue;
    }

    //------------------------------------------------
    // Recipient Messaging State
    //------------------------------------------------

    await prisma
      .communicationCampaignRecipient
      .update({
        where: {
          id:
            recipient.id,
        },

        data: {
          status:
            accepted >
            0
              ? CommunicationRecipientStatus.DISPATCHED
              : CommunicationRecipientStatus.FAILED,

          lastError:
            errors.length >
            0
              ? errors
                  .join(
                    " | "
                  )
                  .slice(
                    0,
                    1000
                  )
              : null,
        },
      });
  }

  //------------------------------------------------
  // AI Voice
  //------------------------------------------------

  let aiVoiceQueued =
    false;

  let voiceCampaignId:
    string | null =
      null;

  let ivrQueued =
    false;

  let ivrCampaignId:
    string | null =
      null;

  const voiceErrors:
    string[] =
      [];

//------------------------------------------------
// AI Voice Runtime
//
// STANDARD
//   -> CASCADED
//   -> existing Deepgram/Gemini/TTS bridge
//
// PREMIUM
//   -> GEMINI_LIVE
//   -> Premium runtime adapter
//------------------------------------------------

try {
  const voice =
    await startCommunicationVoiceRuntime({
      communicationCampaignId:
        campaign.id,

      tier:
        campaign.tier,
    });

  aiVoiceQueued =
    voice.queued;

  voiceCampaignId =
    voice.voiceCampaignId;
} catch (
  error
) {
  voiceErrors.push(
    error instanceof
      Error
      ? `AI_VOICE: ${error.message}`
      : "AI_VOICE: Unknown voice dispatch error"
  );
}

  //------------------------------------------------
  // Classic IVR Bridge
  //------------------------------------------------

  try {
    const ivr =
      await startCommunicationIvrCampaign(
        campaign.id
      );

    ivrQueued =
      ivr.queued;

    ivrCampaignId =
      ivr.ivrCampaignId;
  } catch (
    error
  ) {
    voiceErrors.push(
      error instanceof
        Error
        ? `IVR: ${error.message}`
        : "IVR: Unknown IVR dispatch error"
    );
  }

  //------------------------------------------------
  // Overall Voice State
  //------------------------------------------------

  const voiceQueued =
    aiVoiceQueued ||
    ivrQueued;

  if (
    voiceQueued
  ) {
    /*
     * A recipient may have had messaging failure but
     * still have a successfully queued voice channel.
     *
     * Therefore FAILED/PENDING can become DISPATCHED.
     */
    await prisma
      .communicationCampaignRecipient
      .updateMany({
        where: {
          campaignId:
            campaign.id,

          status: {
            in: [
              CommunicationRecipientStatus.PENDING,
              CommunicationRecipientStatus.FAILED,
            ],
          },
        },

        data: {
          status:
            CommunicationRecipientStatus.DISPATCHED,
        },
      });
  }

  //------------------------------------------------
  // Initial Dispatch Result
  //------------------------------------------------

  const acceptedAnyWork =
    messagingAccepted >
      0 ||
    voiceQueued;

  await prisma
    .communicationCampaign
    .updateMany({
      where: {
        id:
          campaign.id,

        status:
          CommunicationCampaignStatus.RUNNING,
      },

      data: {
        status:
          acceptedAnyWork
            ? CommunicationCampaignStatus.DISPATCHED
            : CommunicationCampaignStatus.FAILED,
      },
    });

  return {
    communicationCampaignId:
      campaign.id,

    recipientCount:
      campaign
        .recipients
        .length,

    messagingAccepted,

    messagingFailed,

    smsDeferredForFallback,

    aiVoiceQueued,

    ivrQueued,

    voiceQueued,

    voiceCampaignId,

    ivrCampaignId,

    voiceErrors,
  };
}

//--------------------------------------------------
// Empty Result
//--------------------------------------------------

function emptyResult(
  communicationCampaignId:
    string
): RunCommunicationCampaignResult {
  return {
    communicationCampaignId,

    recipientCount:
      0,

    messagingAccepted:
      0,

    messagingFailed:
      0,

    smsDeferredForFallback:
      0,

    aiVoiceQueued:
      false,

    ivrQueued:
      false,

    voiceQueued:
      false,

    voiceCampaignId:
      null,

    ivrCampaignId:
      null,

    voiceErrors:
      [],
  };
}

//--------------------------------------------------
// Failure
//--------------------------------------------------

async function markCampaignFailed(
  campaignId:
    string
): Promise<void> {
  await prisma
    .communicationCampaign
    .updateMany({
      where: {
        id:
          campaignId,

        status: {
          in: [
            CommunicationCampaignStatus.QUEUED,
            CommunicationCampaignStatus.SCHEDULED,
            CommunicationCampaignStatus.RUNNING,
          ],
        },
      },

      data: {
        status:
          CommunicationCampaignStatus.FAILED,
      },
    });
}