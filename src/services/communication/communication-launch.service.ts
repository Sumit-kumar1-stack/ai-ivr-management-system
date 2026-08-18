import {
  CommunicationCampaignStatus,
  CommunicationChannel,
} from "@prisma/client";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

import {
  CommunicationCampaignQueueService,
} from "./communication-campaign-queue.service";

import {
  assertCommunicationCampaignEntitlements,
} from "./communication-entitlement.service";

import {
  requirePublishedCommunicationIvrFlow,
} from "./communication-ivr-binding.service";

import {
  compensateCommunicationCampaignQueueFailure,
  reserveCommunicationCampaignLaunch,
} from "./communication-usage-limit.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "communication-launch"
  );

//--------------------------------------------------
// Launch
//--------------------------------------------------

export async function launchCommunicationCampaign(
  campaignId:
    string
) {
  const id =
    campaignId
      .trim();

  if (
    !id
  ) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  //------------------------------------------------
  // Campaign Snapshot
  //------------------------------------------------

  const campaign =
    await prisma
      .communicationCampaign
      .findUnique({
        where: {
          id,
        },

        select: {
          id:
            true,

          status:
            true,

          tier:
            true,

          launchImmediately:
            true,

          scheduledAt:
            true,

          channels:
            true,

          smartChanneling:
            true,

          fallbackPolicy:
            true,

          ivrFlowId:
            true,

          _count: {
            select: {
              recipients:
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
  // Recipients
  //------------------------------------------------

  const recipientCount =
    campaign
      ._count
      .recipients;

  if (
    recipientCount ===
    0
  ) {
    throw new Error(
      "Communication campaign has no recipient snapshots"
    );
  }

  //------------------------------------------------
  // Channels
  //------------------------------------------------

  if (
    campaign.channels
      .length ===
    0
  ) {
    throw new Error(
      "Communication campaign has no selected channels"
    );
  }

  //------------------------------------------------
  // Runtime Entitlement Gate
  //
  // The campaign's stored tier is the authoritative
  // subscription snapshot. Never grant features from
  // the current environment if the campaign itself was
  // created under a lower tier.
  //------------------------------------------------

  const entitlement =
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

      recipientCount,
    });

  //------------------------------------------------
  // IVR Must Be Configured Before Queueing
  //------------------------------------------------

  if (
    campaign.channels
      .includes(
        CommunicationChannel.IVR
      )
  ) {
    if (
      !campaign.ivrFlowId
    ) {
      throw new Error(
        "IVR_FLOW_CONFIGURATION_REQUIRED: Select a published IVR flow before launching this campaign."
      );
    }

    /*
     * Re-check at launch. The flow may have been
     * changed or unpublished after operator selection.
     */
    await requirePublishedCommunicationIvrFlow(
      campaign.ivrFlowId
    );
  }

  //------------------------------------------------
  // Schedule
  //------------------------------------------------

  let delayMs =
    0;

  let scheduled =
    false;

  if (
    !campaign
      .launchImmediately
  ) {
    if (
      !campaign.scheduledAt
    ) {
      throw new Error(
        "Scheduled communication campaign has no scheduledAt value"
      );
    }

    delayMs =
      campaign
        .scheduledAt
        .getTime() -
      Date.now();

    if (
      delayMs >
      0
    ) {
      scheduled =
        true;
    } else {
      delayMs =
        0;
    }
  }

  const targetStatus =
    scheduled
      ? CommunicationCampaignStatus.SCHEDULED
      : CommunicationCampaignStatus.QUEUED;

  //------------------------------------------------
  // Daily Usage Date
  //
  // Future scheduled campaigns reserve against their
  // execution day. Immediate / overdue schedules use
  // today's UTC usage bucket.
  //------------------------------------------------

  const usageDate =
    scheduled &&
    campaign.scheduledAt
      ? campaign.scheduledAt
      : new Date();

  //------------------------------------------------
  // Atomic Plan Reservation + Status Claim
  //------------------------------------------------

  const usage =
    await reserveCommunicationCampaignLaunch({
      campaignId:
        campaign.id,

      tier:
        campaign.tier,

      recipientCount,

      usageDate,

      targetStatus,
    });

  //------------------------------------------------
  // Queue
  //------------------------------------------------

  try {
    await CommunicationCampaignQueueService
      .enqueue(
        {
          communicationCampaignId:
            campaign.id,
        },
        delayMs
      );
  } catch (
    error
  ) {
    //------------------------------------------------
    // Compensation
    //------------------------------------------------

    log.error(
      {
        event:
          "communication.launch.queue_failed",

        communicationCampaignId:
          campaign.id,

        targetStatus,

        usageDate:
          usage
            .usageDate
            .toISOString(),

        error:
          normalizeError(
            error
          ),
      },
      "Communication campaign queue enqueue failed"
    );

    try {
      await compensateCommunicationCampaignQueueFailure({
        campaignId:
          campaign.id,

        usageDate:
          usage.usageDate,

        expectedStatus:
          targetStatus,
      });
    } catch (
      compensationError
    ) {
      //------------------------------------------------
      // Conservative failure mode:
      //
      // If compensation itself fails, retain the claimed
      // status/quota rather than risking an unaccounted
      // execution. Operations can reconcile it safely.
      //------------------------------------------------

      log.error(
        {
          event:
            "communication.launch.compensation_failed",

          communicationCampaignId:
            campaign.id,

          usageDate:
            usage
              .usageDate
              .toISOString(),

          error:
            normalizeError(
              compensationError
            ),
        },
        "Communication launch compensation failed"
      );
    }

    throw error;
  }

  //------------------------------------------------
  // Accepted
  //------------------------------------------------

  log.info(
    {
      event:
        "communication.launch.accepted",

      communicationCampaignId:
        campaign.id,

      tier:
        campaign.tier,

      voiceRuntime:
        entitlement
          .voiceRuntime,

      status:
        targetStatus,

      scheduled,

      recipientCount,

      activeCampaigns:
        usage
          .activeCampaignsAfter,

      concurrencyLimit:
        usage
          .concurrencyLimit,

      dailyRecipientsUsed:
        usage
          .dailyRecipientsUsedAfter,

      dailyRecipientsLimit:
        usage
          .dailyRecipientsLimit,

      usageDate:
        usage
          .usageDate
          .toISOString(),
    },
    "Communication campaign launch accepted"
  );

  return {
    communicationCampaignId:
      campaign.id,

    status:
      targetStatus,

    scheduled,

    scheduledAt:
      scheduled
        ? campaign
            .scheduledAt
            ?.toISOString() ??
          null
        : null,

    recipientCount,

    tier:
      campaign.tier,

    voiceRuntime:
      entitlement
        .voiceRuntime,

    usage: {
      usageDate:
        usage
          .usageDate
          .toISOString(),

      dailyRecipientsUsed:
        usage
          .dailyRecipientsUsedAfter,

      dailyRecipientsLimit:
        usage
          .dailyRecipientsLimit,

      activeCampaigns:
        usage
          .activeCampaignsAfter,

      campaignConcurrencyLimit:
        usage
          .concurrencyLimit,
    },
  };
}
