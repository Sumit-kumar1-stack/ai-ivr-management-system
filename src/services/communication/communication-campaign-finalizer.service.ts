import {
  AuditEventOutcome,
  CallbackRequestStatus,
  CallStatus,
  CampaignStatus,
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationFallbackPolicy,
  CommunicationOutboundAttemptStatus,
  CommunicationRecipientStatus,
  MessagingChannel,
  OutboundMessageStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  recordAuditEvent,
} from "@/services/audit/audit-event.service";
import {
  OUTBOUND_REALTIME_EVENTS,
  publishOutboundEvent,
} from "./communication-outbound-events.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "communication-campaign-finalizer"
  );

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface CommunicationCampaignFinalizationResult {
  campaignId:
    string;

  finalized:
    boolean;

  skipped:
    boolean;

  reason:
    string;

  status:
    CommunicationCampaignStatus;

  totalRecipients:
    number;

  completedRecipients:
    number;

  failedRecipients:
    number;

  unresolvedRecipients:
    number;
}

//--------------------------------------------------
// Terminal Sets
//--------------------------------------------------

const TERMINAL_MESSAGE_STATUSES:
  readonly OutboundMessageStatus[] = [
    OutboundMessageStatus.DELIVERED,
    OutboundMessageStatus.READ,
    OutboundMessageStatus.FAILED,
    OutboundMessageStatus.UNDELIVERED,
  ];

const SUCCESS_MESSAGE_STATUSES:
  readonly OutboundMessageStatus[] = [
    OutboundMessageStatus.DELIVERED,
    OutboundMessageStatus.READ,
  ];

const TERMINAL_CHILD_CAMPAIGN_STATUSES:
  readonly CampaignStatus[] = [
    CampaignStatus.COMPLETED,
    CampaignStatus.FAILED,
    CampaignStatus.CANCELLED,
  ];

const TERMINAL_CALL_STATUSES:
  readonly CallStatus[] = [
    CallStatus.COMPLETED,
    CallStatus.FAILED,
    CallStatus.BUSY,
    CallStatus.NO_ANSWER,
    CallStatus.CANCELED,
  ];

const ACTIVE_CALLBACK_STATUSES:
  CallbackRequestStatus[] = [
    CallbackRequestStatus.PENDING,
    CallbackRequestStatus.CONFIRMED,
    CallbackRequestStatus.CLAIMED,
    CallbackRequestStatus.REQUESTED,
    CallbackRequestStatus.SCHEDULED,
  ];

//--------------------------------------------------
// Internal Types
//--------------------------------------------------

interface MessageSnapshot {
  channel:
    MessagingChannel;

  status:
    OutboundMessageStatus;
}

interface VoiceOutcome {
  resolved:
    boolean;

  successful:
    boolean;

  failureReason:
    string | null;
}

interface RecipientOutcome {
  resolved:
    boolean;

  successful:
    boolean;

  failureReason:
    string | null;
}

//--------------------------------------------------
// Public Terminal Helpers
//--------------------------------------------------

export function isCommunicationMessageTerminal(
  status:
    OutboundMessageStatus
): boolean {
  return TERMINAL_MESSAGE_STATUSES
    .includes(
      status
    );
}

export function isCommunicationChildCampaignTerminal(
  status:
    CampaignStatus
): boolean {
  return TERMINAL_CHILD_CAMPAIGN_STATUSES
    .includes(
      status
    );
}

//--------------------------------------------------
// Finalize Parent If Ready
//--------------------------------------------------

export async function finalizeCommunicationCampaignIfReady(
  communicationCampaignId:
    string
): Promise<CommunicationCampaignFinalizationResult> {
  const id =
    communicationCampaignId
      .trim();

  if (
    !id
  ) {
    throw new Error(
      "Communication campaign id is required"
    );
  }

  //------------------------------------------------
  // Load Parent + Durable Child State
  //------------------------------------------------

  const campaign =
    await prisma
      .communicationCampaign
      .findUnique({
        where: {
          id,
        },

        include: {
          recipients: {
            include: {
              messages:
                true,
            },
          },

          outboundAttempts: {
            select: {
              status:
                true,
            },
          },

          calls: {
            select: {
              id:
                true,
            },
          },

          ownerUser: {
            select: {
              tenantId:
                true,
            },
          },

          voiceCampaign: {
            select: {
              id:
                true,

              status:
                true,
            },
          },

          ivrCampaign: {
            select: {
              id:
                true,

              status:
                true,
            },
          },
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
  // Already Terminal
  //------------------------------------------------

  if (
    campaign.status ===
      CommunicationCampaignStatus.COMPLETED ||
    campaign.status ===
      CommunicationCampaignStatus.FAILED ||
    campaign.status ===
      CommunicationCampaignStatus.CANCELLED
  ) {
    return result({
      campaignId:
        campaign.id,

      finalized:
        false,

      skipped:
        true,

      reason:
        "Communication campaign is already terminal",

      status:
        campaign.status,

      totalRecipients:
        campaign.recipients.length,

      completedRecipients:
        campaign.recipients.filter(
          recipient =>
            recipient.status ===
              CommunicationRecipientStatus.COMPLETED
        ).length,

      failedRecipients:
        campaign.recipients.filter(
          recipient =>
            recipient.status ===
              CommunicationRecipientStatus.FAILED
        ).length,

      unresolvedRecipients:
        0,
    });
  }

  //------------------------------------------------
  // E.2 Provider-Neutral Attempt Settlement
  //
  // Queue emptiness is deliberately irrelevant. Durable queued/claimed
  // attempts, actionable recipients, future retry dates, and remaining retry
  // budget all keep the campaign open.
  //------------------------------------------------

  if (
    campaign.outboundAttempts.length > 0
  ) {
    const campaignCallIds =
      campaign.calls.map(
        call =>
          call.id
      );
    const activeCallbacks =
      campaignCallIds.length > 0
        ? await prisma.callbackRequest.count({
            where: {
              status: {
                in:
                  ACTIVE_CALLBACK_STATUSES,
              },
              OR: [
                {
                  callId: {
                    in:
                      campaignCallIds,
                  },
                },
                {
                  originalCallId: {
                    in:
                      campaignCallIds,
                  },
                },
              ],
            },
          })
        : 0;
    const activeAttempts =
      campaign.outboundAttempts.filter(
        attempt =>
          attempt.status ===
            CommunicationOutboundAttemptStatus.QUEUED ||
          attempt.status ===
            CommunicationOutboundAttemptStatus.CLAIMED ||
          attempt.status ===
            CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING ||
          attempt.status ===
            CommunicationOutboundAttemptStatus.PROVIDER_ACCEPTED ||
          attempt.status ===
            CommunicationOutboundAttemptStatus.RINGING ||
          attempt.status ===
            CommunicationOutboundAttemptStatus.ANSWERED
      ).length;

    const actionableRecipients =
      campaign.recipients.filter(
        recipient =>
          recipient.status ===
            CommunicationRecipientStatus.PROCESSING ||
          (
            recipient.status ===
              CommunicationRecipientStatus.PENDING &&
            (
              recipient.nextAttemptAt !== null ||
              recipient.attemptCount <
                campaign.maxAttempts
            )
          )
      ).length;

    const unresolvedRecipients =
      Math.max(
        activeAttempts,
        actionableRecipients,
        activeCallbacks
      );

    if (
      unresolvedRecipients > 0 ||
      campaign.status ===
        CommunicationCampaignStatus.PAUSED ||
      campaign.status ===
        CommunicationCampaignStatus.SCHEDULED ||
      campaign.status ===
        CommunicationCampaignStatus.QUEUED
    ) {
      return result({
        campaignId:
          campaign.id,
        finalized:
          false,
        skipped:
          true,
        reason:
          "Outbound attempts, actionable recipients, deferred work, or retries remain",
        status:
          campaign.status,
        totalRecipients:
          campaign.recipients.length,
        completedRecipients:
          campaign.recipients.filter(
            recipient =>
              recipient.status ===
                CommunicationRecipientStatus.COMPLETED
          ).length,
        failedRecipients:
          campaign.recipients.filter(
            recipient =>
              recipient.status ===
                CommunicationRecipientStatus.FAILED
          ).length,
        unresolvedRecipients,
      });
    }

    const completedRecipients =
      campaign.recipients.filter(
        recipient =>
          recipient.status ===
            CommunicationRecipientStatus.COMPLETED
      ).length;

    const failedRecipients =
      campaign.recipients.length -
      completedRecipients;

    const finalStatus =
      completedRecipients > 0
        ? CommunicationCampaignStatus.COMPLETED
        : CommunicationCampaignStatus.FAILED;

    const finalized =
      await prisma.communicationCampaign.updateMany({
        where: {
          id:
            campaign.id,
          status: {
            in: [
              CommunicationCampaignStatus.RUNNING,
              CommunicationCampaignStatus.DISPATCHED,
            ],
          },
        },
        data: {
          status:
            finalStatus,
        },
      });

    if (
      finalized.count === 1 &&
      campaign.ownerUser?.tenantId
    ) {
      try {
        await recordAuditEvent({
          tenantId:
            campaign.ownerUser.tenantId,
          actor:
            null,
          entityType:
            "CommunicationCampaign",
          entityId:
            campaign.id,
          action:
            finalStatus ===
            CommunicationCampaignStatus.COMPLETED
              ? "COMPLETED"
              : "FAILED",
          outcome:
            AuditEventOutcome.SUCCEEDED,
          afterState: {
            status:
              finalStatus,
            completedRecipients,
            failedRecipients,
            providerNeutral:
              true,
          },
        });
      } catch {
        // Existing campaign audit hooks are best effort.
      }

      publishOutboundEvent(
        OUTBOUND_REALTIME_EVENTS.CAMPAIGN_COMPLETED,
        {
          tenantId:
            campaign.ownerUser.tenantId,
          campaignId:
            campaign.id,
        },
        {
          status:
            finalStatus,
          completedRecipients,
          failedRecipients,
        }
      );
      publishOutboundEvent(
        OUTBOUND_REALTIME_EVENTS.PROGRESS_UPDATED,
        {
          tenantId:
            campaign.ownerUser.tenantId,
          campaignId:
            campaign.id,
        }
      );
    }

    return result({
      campaignId:
        campaign.id,
      finalized:
        finalized.count === 1,
      skipped:
        finalized.count !== 1,
      reason:
        finalized.count === 1
          ? "Every provider-neutral outbound attempt and retry is settled"
          : "Communication campaign changed concurrently",
      status:
        finalStatus,
      totalRecipients:
        campaign.recipients.length,
      completedRecipients,
      failedRecipients,
      unresolvedRecipients:
        0,
    });
  }

  //------------------------------------------------
  // Initial Dispatch Must Finish First
  //------------------------------------------------

  if (
    campaign.status !==
      CommunicationCampaignStatus.DISPATCHED
  ) {
    return result({
      campaignId:
        campaign.id,

      finalized:
        false,

      skipped:
        true,

      reason:
        "Initial communication dispatch is not finished",

      status:
        campaign.status,

      totalRecipients:
        campaign.recipients.length,

      completedRecipients:
        0,

      failedRecipients:
        0,

      unresolvedRecipients:
        campaign.recipients.length,
    });
  }

  //------------------------------------------------
  // Empty Campaign Cannot Be Successful
  //------------------------------------------------

  if (
    campaign.recipients.length ===
    0
  ) {
    const updated =
      await prisma
        .communicationCampaign
        .updateMany({
          where: {
            id:
              campaign.id,

            status:
              CommunicationCampaignStatus.DISPATCHED,
          },

          data: {
            status:
          CommunicationCampaignStatus.FAILED,
          },
        });

    if (
      updated.count ===
      1
    ) {
      try {
        const tenantId =
          campaign.ownerUser?.tenantId ?? "";

        if (tenantId) {
          await recordAuditEvent({
            tenantId,

            actor: null,

            entityType:
              "CommunicationCampaign",

            entityId:
              campaign.id,

            action:
              "FAILED",

            outcome:
              AuditEventOutcome.SUCCEEDED,

            afterState: {
              status:
                CommunicationCampaignStatus.FAILED,
              totalRecipients: 0,
            },
          });
        }
      } catch {
        // Best-effort audit logging only.
      }
    }

    return result({
      campaignId:
        campaign.id,

      finalized:
        updated.count ===
        1,

      skipped:
        updated.count !==
        1,

      reason:
        updated.count ===
        1
          ? "Communication campaign has no recipients"
          : "Communication campaign changed concurrently",

      status:
        CommunicationCampaignStatus.FAILED,

      totalRecipients:
        0,

      completedRecipients:
        0,

      failedRecipients:
        0,

      unresolvedRecipients:
        0,
    });
  }

  //------------------------------------------------
  // Child Voice Snapshot
  //------------------------------------------------

  const voiceByPhone =
    campaign.voiceCampaignId
      ? await loadVoiceOutcomeByPhone(
          campaign.voiceCampaignId,
          campaign.voiceCampaign?.status ??
            null
        )
      : new Map<
          string,
          VoiceOutcome
        >();

  const ivrByPhone =
    campaign.ivrCampaignId
      ? await loadVoiceOutcomeByPhone(
          campaign.ivrCampaignId,
          campaign.ivrCampaign?.status ??
            null
        )
      : new Map<
          string,
          VoiceOutcome
        >();

  //------------------------------------------------
  // Derive Every Recipient Outcome
  //------------------------------------------------

  let completedRecipients =
    0;

  let failedRecipients =
    0;

  let unresolvedRecipients =
    0;

  const updates:
    Array<{
      id:
        string;

      status:
        CommunicationRecipientStatus;

      lastError:
        string | null;
    }> =
      [];

  for (
    const recipient
    of campaign.recipients
  ) {
    const outcome =
      deriveRecipientOutcome({
        channels:
          campaign.channels,

        fallbackPolicy:
          campaign.fallbackPolicy,

        recipientStatus:
          recipient.status,

        recipientLastError:
          recipient.lastError,

        messages:
          recipient.messages,

        voiceOutcome:
          campaign.channels.includes(
            CommunicationChannel.AI_VOICE
          )
            ? campaign.voiceCampaignId
              ? voiceByPhone.get(
                  recipient.phone
                ) ??
                terminalMissingVoiceOutcome(
                  campaign.voiceCampaign?.status ??
                    null,
                  "AI Voice"
                )
              : {
                  resolved:
                    true,

                  successful:
                    false,

                  failureReason:
                    "AI Voice child campaign was not created",
                }
            : null,

        ivrOutcome:
          campaign.channels.includes(
            CommunicationChannel.IVR
          )
            ? campaign.ivrCampaignId
              ? ivrByPhone.get(
                  recipient.phone
                ) ??
                terminalMissingVoiceOutcome(
                  campaign.ivrCampaign?.status ??
                    null,
                  "IVR"
                )
              : {
                  resolved:
                    true,

                  successful:
                    false,

                  failureReason:
                    "IVR child campaign was not created",
                }
            : null,
      });

    if (
      !outcome.resolved
    ) {
      unresolvedRecipients +=
        1;

      continue;
    }

    if (
      outcome.successful
    ) {
      completedRecipients +=
        1;

      updates.push({
        id:
          recipient.id,

        status:
          CommunicationRecipientStatus.COMPLETED,

        lastError:
          outcome.failureReason,
      });
    } else {
      failedRecipients +=
        1;

      updates.push({
        id:
          recipient.id,

        status:
          CommunicationRecipientStatus.FAILED,

        lastError:
          outcome.failureReason ??
          "All selected communication channels failed",
      });
    }
  }

  //------------------------------------------------
  // Wait Until Every Recipient Is Settled
  //------------------------------------------------

  if (
    unresolvedRecipients >
    0
  ) {
    return result({
      campaignId:
        campaign.id,

      finalized:
        false,

      skipped:
        true,

      reason:
        "Communication recipients still have unresolved provider or call outcomes",

      status:
        campaign.status,

      totalRecipients:
        campaign.recipients.length,

      completedRecipients,

      failedRecipients,

      unresolvedRecipients,
    });
  }

  //------------------------------------------------
  // Final Parent State
  //------------------------------------------------

  const finalStatus =
    completedRecipients >
    0
      ? CommunicationCampaignStatus.COMPLETED
      : CommunicationCampaignStatus.FAILED;

  //------------------------------------------------
  // Transactional Recipient + Parent Settlement
  //------------------------------------------------

  const finalized =
    await prisma
      .$transaction(
        async transaction => {
          const parent =
            await transaction
              .communicationCampaign
              .updateMany({
                where: {
                  id:
                    campaign.id,

                  status:
                    CommunicationCampaignStatus.DISPATCHED,
                },

                data: {
                  status:
                    finalStatus,
                },
              });

          if (
            parent.count !==
            1
          ) {
            return false;
          }

          for (
            const update
            of updates
          ) {
            await transaction
              .communicationCampaignRecipient
              .updateMany({
                where: {
                  id:
                    update.id,

                  campaignId:
                    campaign.id,

                  status: {
                    notIn: [
                      CommunicationRecipientStatus.COMPLETED,
                      CommunicationRecipientStatus.SKIPPED,
                    ],
                  },
                },

                data: {
                  status:
                    update.status,

                  lastError:
                    update.lastError
                      ?.slice(
                        0,
                        1000
                      ) ??
                    null,
                },
              });
          }

          return true;
        }
      );

  //------------------------------------------------
  // Concurrent Winner
  //------------------------------------------------

  if (
    !finalized
  ) {
    const current =
      await prisma
        .communicationCampaign
        .findUnique({
          where: {
            id:
              campaign.id,
          },

          select: {
            status:
              true,
          },
        });

    return result({
      campaignId:
        campaign.id,

      finalized:
        false,

      skipped:
        true,

      reason:
        "Communication campaign was finalized or changed by another process",

      status:
        current?.status ??
        finalStatus,

      totalRecipients:
        campaign.recipients.length,

      completedRecipients,

      failedRecipients,

      unresolvedRecipients:
        0,
    });
  }

  try {
    const tenantId =
      campaign.ownerUser?.tenantId ?? "";

    if (tenantId) {
      await recordAuditEvent({
        tenantId,

        actor: null,

        entityType:
          "CommunicationCampaign",

        entityId:
          campaign.id,

        action:
          finalStatus ===
          CommunicationCampaignStatus.COMPLETED
            ? "COMPLETED"
            : "FAILED",

        outcome:
          AuditEventOutcome.SUCCEEDED,

        afterState: {
          status:
            finalStatus,
          completedRecipients,
          failedRecipients,
        },
      });
    }
  } catch {
    // Best-effort audit logging only.
  }

  log.info(
    {
      event:
        "communication.campaign.finalized",

      communicationCampaignId:
        campaign.id,

      finalStatus,

      totalRecipients:
        campaign.recipients.length,

      completedRecipients,

      failedRecipients,
    },
    "Communication campaign finalized"
  );

  return result({
    campaignId:
      campaign.id,

    finalized:
      true,

    skipped:
      false,

    reason:
      "Every communication recipient has a settled final outcome",

    status:
      finalStatus,

    totalRecipients:
      campaign.recipients.length,

    completedRecipients,

    failedRecipients,

    unresolvedRecipients:
      0,
  });
}

//--------------------------------------------------
// Child Campaign Hook
//--------------------------------------------------

export async function finalizeCommunicationCampaignForChildCampaign(
  childCampaignId:
    string
): Promise<CommunicationCampaignFinalizationResult | null> {
  const parent =
    await prisma
      .communicationCampaign
      .findFirst({
        where: {
          OR: [
            {
              voiceCampaignId:
                childCampaignId,
            },
            {
              ivrCampaignId:
                childCampaignId,
            },
          ],
        },

        select: {
          id:
            true,
        },
      });

  if (
    !parent
  ) {
    return null;
  }

  return finalizeCommunicationCampaignIfReady(
    parent.id
  );
}

//--------------------------------------------------
// Best-Effort Reconciliation Hook
//--------------------------------------------------

export async function tryFinalizeCommunicationCampaign(
  communicationCampaignId:
    string | null | undefined
): Promise<void> {
  if (
    !communicationCampaignId
  ) {
    return;
  }

  try {
    await finalizeCommunicationCampaignIfReady(
      communicationCampaignId
    );
  } catch (
    error
  ) {
    log.warn(
      {
        event:
          "communication.campaign.finalization_hook_failed",

        communicationCampaignId,

        error:
          normalizeError(
            error
          ),
      },
      "Communication campaign reconciliation hook failed"
    );
  }
}

//--------------------------------------------------
// Load Latest Call Outcome By Recipient Phone
//--------------------------------------------------

async function loadVoiceOutcomeByPhone(
  childCampaignId:
    string,

  childStatus:
    CampaignStatus | null
): Promise<Map<string, VoiceOutcome>> {
  const map =
    new Map<
      string,
      VoiceOutcome
    >();

  //------------------------------------------------
  // Child Still Active -> Everything Is Unresolved
  //------------------------------------------------

  if (
    !childStatus ||
    !isCommunicationChildCampaignTerminal(
      childStatus
    )
  ) {
    return map;
  }

  const calls =
    await prisma
      .call
      .findMany({
        where: {
          campaignId:
            childCampaignId,
        },

        include: {
          contact: {
            select: {
              phone:
                true,
            },
          },
        },

        orderBy: [
          {
            attemptNumber:
              "desc",
          },
          {
            createdAt:
              "desc",
          },
        ],
      });

  for (
    const call
    of calls
  ) {
    if (!call.contact) {
      continue;
    }
    const phone =
      call.contact.phone;

    if (
      map.has(
        phone
      )
    ) {
      continue;
    }

    const terminal =
      TERMINAL_CALL_STATUSES
        .includes(
          call.status
        );

    map.set(
      phone,
      {
        resolved:
          terminal,

        successful:
          call.status ===
          CallStatus.COMPLETED,

        failureReason:
          call.status ===
            CallStatus.COMPLETED
            ? null
            : terminal
              ? `Final call status: ${call.status}`
              : null,
      }
    );
  }

  return map;
}

//--------------------------------------------------
// Missing Call Outcome
//--------------------------------------------------

function terminalMissingVoiceOutcome(
  childStatus:
    CampaignStatus | null,

  label:
    string
): VoiceOutcome {
  if (
    !childStatus ||
    !isCommunicationChildCampaignTerminal(
      childStatus
    )
  ) {
    return {
      resolved:
        false,

      successful:
        false,

      failureReason:
        null,
    };
  }

  return {
    resolved:
      true,

    successful:
      false,

    failureReason:
      `${label} completed without a terminal call outcome for this recipient`,
  };
}

//--------------------------------------------------
// Recipient Outcome
//--------------------------------------------------

function deriveRecipientOutcome(
  input: {
    channels:
      CommunicationChannel[];

    fallbackPolicy:
      CommunicationFallbackPolicy;

    recipientStatus:
      CommunicationRecipientStatus;

    recipientLastError:
      string | null;

    messages:
      MessageSnapshot[];

    voiceOutcome:
      VoiceOutcome | null;

    ivrOutcome:
      VoiceOutcome | null;
  }
): RecipientOutcome {
  const outcomes:
    Array<{
      resolved:
        boolean;

      successful:
        boolean;

      failureReason:
        string | null;
    }> =
      [];

  //------------------------------------------------
  // Messaging
  //------------------------------------------------

  const hasWhatsApp =
    input.channels.includes(
      CommunicationChannel.WHATSAPP
    );

  const hasSms =
    input.channels.includes(
      CommunicationChannel.SMS
    );

  const fallback =
    input.fallbackPolicy ===
      CommunicationFallbackPolicy.WHATSAPP_TO_SMS &&
    hasWhatsApp &&
    hasSms;

  if (
    fallback
  ) {
    outcomes.push(
      deriveFallbackMessagingOutcome(
        input.messages,
        input.recipientStatus,
        input.recipientLastError
      )
    );
  } else {
    if (
      hasWhatsApp
    ) {
      outcomes.push(
        deriveDirectMessagingOutcome(
          input.messages,
          MessagingChannel.WHATSAPP,
          input.recipientStatus,
          input.recipientLastError,
          "WhatsApp"
        )
      );
    }

    if (
      hasSms
    ) {
      outcomes.push(
        deriveDirectMessagingOutcome(
          input.messages,
          MessagingChannel.SMS,
          input.recipientStatus,
          input.recipientLastError,
          "SMS"
        )
      );
    }
  }

  //------------------------------------------------
  // AI Voice / IVR
  //------------------------------------------------

  if (
    input.voiceOutcome
  ) {
    outcomes.push(
      input.voiceOutcome
    );
  }

  if (
    input.ivrOutcome
  ) {
    outcomes.push(
      input.ivrOutcome
    );
  }

  //------------------------------------------------
  // Nothing Selected Should Not Finalize Success
  //------------------------------------------------

  if (
    outcomes.length ===
    0
  ) {
    return {
      resolved:
        true,

      successful:
        false,

      failureReason:
        "No executable communication channel was selected",
    };
  }

  //------------------------------------------------
  // Wait Until Every Selected Route Settles
  //------------------------------------------------

  if (
    outcomes.some(
      outcome =>
        !outcome.resolved
    )
  ) {
    return {
      resolved:
        false,

      successful:
        false,

      failureReason:
        null,
    };
  }

  const successful =
    outcomes.some(
      outcome =>
        outcome.successful
    );

  const failures =
    outcomes
      .map(
        outcome =>
          outcome.failureReason
      )
      .filter(
        (
          value
        ): value is string =>
          Boolean(
            value
          )
      );

  return {
    resolved:
      true,

    successful,

    failureReason:
      failures.length >
      0
        ? failures
            .join(
              " | "
            )
            .slice(
              0,
              1000
            )
        : null,
  };
}

//--------------------------------------------------
// Direct Messaging Outcome
//--------------------------------------------------

function deriveDirectMessagingOutcome(
  messages:
    MessageSnapshot[],

  channel:
    MessagingChannel,

  recipientStatus:
    CommunicationRecipientStatus,

  recipientLastError:
    string | null,

  label:
    string
): RecipientOutcome {
  const matching =
    messages.filter(
      message =>
        message.channel ===
        channel
    );

  if (
    matching.length ===
    0
  ) {
    if (
      recipientStatus ===
        CommunicationRecipientStatus.FAILED
    ) {
      return {
        resolved:
          true,

        successful:
          false,

        failureReason:
          recipientLastError ??
          `${label} dispatch failed before provider acceptance`,
      };
    }

    return {
      resolved:
        false,

      successful:
        false,

      failureReason:
        null,
    };
  }

  if (
    matching.some(
      message =>
        !isCommunicationMessageTerminal(
          message.status
        )
    )
  ) {
    return {
      resolved:
        false,

      successful:
        false,

      failureReason:
        null,
    };
  }

  const successful =
    matching.some(
      message =>
        SUCCESS_MESSAGE_STATUSES
          .includes(
            message.status
          )
    );

  return {
    resolved:
      true,

    successful,

    failureReason:
      successful
        ? null
        : `${label} delivery failed`,
  };
}

//--------------------------------------------------
// WhatsApp -> SMS Fallback Outcome
//--------------------------------------------------

function deriveFallbackMessagingOutcome(
  messages:
    MessageSnapshot[],

  recipientStatus:
    CommunicationRecipientStatus,

  recipientLastError:
    string | null
): RecipientOutcome {
  const whatsapp =
    messages.filter(
      message =>
        message.channel ===
        MessagingChannel.WHATSAPP
    );

  const sms =
    messages.filter(
      message =>
        message.channel ===
        MessagingChannel.SMS
    );

  //------------------------------------------------
  // WhatsApp Dispatch Failed Before Reservation
  // and Fallback Also Failed Before Reservation.
  //------------------------------------------------

  if (
    whatsapp.length ===
      0 &&
    recipientStatus ===
      CommunicationRecipientStatus.FAILED
  ) {
    return {
      resolved:
        true,

      successful:
        false,

      failureReason:
        recipientLastError ??
        "WhatsApp and SMS fallback dispatch failed",
    };
  }

  //------------------------------------------------
  // Wait For WhatsApp Terminal Provider Outcome
  //------------------------------------------------

  if (
    whatsapp.length ===
      0 ||
    whatsapp.some(
      message =>
        !isCommunicationMessageTerminal(
          message.status
        )
    )
  ) {
    return {
      resolved:
        false,

      successful:
        false,

      failureReason:
        null,
    };
  }

  //------------------------------------------------
  // WhatsApp Delivered -> Fallback Not Needed
  //------------------------------------------------

  if (
    whatsapp.some(
      message =>
        SUCCESS_MESSAGE_STATUSES
          .includes(
            message.status
          )
    )
  ) {
    return {
      resolved:
        true,

      successful:
        true,

      failureReason:
        null,
    };
  }

  //------------------------------------------------
  // WhatsApp Failed -> Wait For SMS Fallback
  //------------------------------------------------

  if (
    sms.length ===
    0
  ) {
    if (
      recipientStatus ===
        CommunicationRecipientStatus.FAILED
    ) {
      return {
        resolved:
          true,

        successful:
          false,

        failureReason:
          recipientLastError ??
          "WhatsApp failed and SMS fallback could not be dispatched",
      };
    }

    return {
      resolved:
        false,

      successful:
        false,

      failureReason:
        null,
    };
  }

  if (
    sms.some(
      message =>
        !isCommunicationMessageTerminal(
          message.status
        )
    )
  ) {
    return {
      resolved:
        false,

      successful:
        false,

      failureReason:
        null,
    };
  }

  const successful =
    sms.some(
      message =>
        SUCCESS_MESSAGE_STATUSES
          .includes(
            message.status
          )
    );

  return {
    resolved:
      true,

    successful,

    failureReason:
      successful
        ? "WhatsApp delivery failed; SMS fallback delivered"
        : "WhatsApp delivery failed and SMS fallback also failed",
  };
}

//--------------------------------------------------
// Result Builder
//--------------------------------------------------

function result(
  value:
    CommunicationCampaignFinalizationResult
): CommunicationCampaignFinalizationResult {
  return value;
}
