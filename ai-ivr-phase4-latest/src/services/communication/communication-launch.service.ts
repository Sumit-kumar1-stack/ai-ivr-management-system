import {
  AuditEventOutcome,
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationCampaignApprovalStatus,
} from "@prisma/client";

import type {
  AuthenticatedUser,
} from "@/lib/auth";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";
import {
  recordAuditEvent,
} from "@/services/audit/audit-event.service";

import {
  assertCommunicationDeploymentChannelsAvailable,
} from "@/config/communication-deployment-capabilities";

import {
  CommunicationCampaignQueueService,
} from "./communication-campaign-queue.service";

import {
  assertCommunicationCampaignEntitlements,
} from "./communication-entitlement.service";

import {
  resolveTenantBillingContextForUser,
} from "@/services/billing/tenant-subscription.service";

import {
  requirePublishedCommunicationIvrFlow,
} from "./communication-ivr-binding.service";

import {
  compensateCommunicationCampaignQueueFailure,
  reserveCommunicationCampaignLaunch,
} from "./communication-usage-limit.service";
import {
  canLaunchCampaign,
  canLaunchCampaignState,
} from "./campaign-permissions";

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
    string,

  user:
    AuthenticatedUser
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

          approvalRequired:
            true,

          approvalStatus:
            true,

          submittedByUserId:
            true,

          approvedByUserId:
            true,

          approvedAt:
            true,

          currentRevision:
            true,

          approvedRevision:
            true,

          ownerUserId:
            true,

          ownerUser: {
            select: {
              tenantId:
                true,
            },
          },

          attemptedContactCount:
            true,

          archivedAt:
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

  const campaignTenantId =
    campaign.ownerUser?.tenantId ??
    null;

  log.info(
    {
      event:
        "CAMPAIGN_LAUNCH_REQUESTED",

      communicationCampaignId:
        campaign.id,

      status:
        campaign.status,

      approvalRequired:
        campaign.approvalRequired,

      approvalStatus:
        campaign.approvalStatus,
    },
    "Communication campaign launch requested"
  );

  const tenantId =
    campaign.ownerUser?.tenantId ??
    user.tenantId ??
    "";

  await recordLaunchAuditEvent({
    tenantId,
    actor: user,
    campaign,
    action:
      "CAMPAIGN_LAUNCH_REQUESTED",
    outcome:
      AuditEventOutcome.SUCCEEDED,
    result:
      "SUCCEEDED",
    afterState: {
      status:
        campaign.status,

      approvalStatus:
        campaign.approvalStatus,

      currentRevision:
        campaign.currentRevision,

      approvedRevision:
        campaign.approvedRevision,
    },
  });

  try {
    if (
      campaign.status ===
      CommunicationCampaignStatus.ARCHIVED
    ) {
      throw new Error(
        "Communication campaign cannot be launched because it is archived"
      );
    }

    if (
      !canLaunchCampaignState(
        campaign
      )
    ) {
      const staleApproval =
        campaign.approvalRequired &&
        campaign.approvalStatus ===
          CommunicationCampaignApprovalStatus.APPROVED &&
        campaign.approvedRevision !==
          campaign.currentRevision;

      throw new Error(
        staleApproval
          ? "Communication campaign approval is stale and must be resubmitted"
          : "Communication campaign is not approved for launch"
      );
    }

  if (
    !canLaunchCampaign(
      user,
      {
        ...campaign,
        tenantId:
          campaignTenantId,
      }
    )
  ) {
    throw new Error(
      "You are not authorized to launch this communication campaign"
    );
    }

    const billingContext =
      await resolveTenantBillingContextForUser(
        user.id
      );

    if (
      !billingContext.launchAllowed
    ) {
      throw new Error(
        "Tenant subscription is not active"
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
    // Deployment Availability Gate
    //------------------------------------------------

    assertCommunicationDeploymentChannelsAvailable(
      campaign.channels
    );

    //------------------------------------------------
    // Runtime Entitlement Gate
    //
    // The current tenant subscription is authoritative.
    // Never trust the stored campaign tier snapshot to
    // authorize a launch.
    //------------------------------------------------

    const entitlement =
      assertCommunicationCampaignEntitlements({
        tier:
          billingContext.effectiveCampaignTier,

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

        tenantId:
          billingContext.tenantId,

        tier:
          billingContext.effectiveCampaignTier,

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

    await recordLaunchAuditEvent({
      tenantId,
      actor: user,
      campaign,
      action:
        "CAMPAIGN_STARTED",
      outcome:
        AuditEventOutcome.SUCCEEDED,
      result:
        "SUCCEEDED",
      afterState: {
        status:
          targetStatus,

        scheduled,

        recipientCount,

        tier:
          billingContext.effectiveCampaignTier,
      },
      metadata: {
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
      },
    });

  log.info(
    {
      event:
        "communication.launch.accepted",

      communicationCampaignId:
        campaign.id,

      tier:
        billingContext.effectiveCampaignTier,

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
      billingContext.effectiveCampaignTier,

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
  } catch (
    error
  ) {
    await recordLaunchAuditEvent({
      tenantId,
      actor: user,
      campaign,
      action:
        "CAMPAIGN_LAUNCH_DENIED",
      outcome:
        AuditEventOutcome.DENIED,
      result:
        "DENIED",
      reason:
        error instanceof Error
          ? error.message
          : "Launch denied",
      beforeState: {
        status:
          campaign.status,

        approvalStatus:
          campaign.approvalStatus,

        currentRevision:
          campaign.currentRevision,

        approvedRevision:
          campaign.approvedRevision,
      },
      metadata: {
        currentRevision:
          campaign.currentRevision,

        approvedRevision:
          campaign.approvedRevision,

        approvalStatus:
          campaign.approvalStatus,
      },
    });

    throw error;
  }
}

type LaunchAuditCampaignSnapshot = {
  id: string;
  status: CommunicationCampaignStatus;
  approvalStatus: CommunicationCampaignApprovalStatus;
  currentRevision: number;
  approvedRevision: number | null;
  ownerUserId: string | null;
  tenantId?: string | null;
  ownerUser: {
    tenantId: string | null;
  } | null;
};

async function recordLaunchAuditEvent(
  input: {
    tenantId: string;
    actor: AuthenticatedUser;
    campaign: LaunchAuditCampaignSnapshot;
    action: string;
    outcome: AuditEventOutcome;
    result?: string | null;
    reason?: string | null;
    beforeState?: unknown;
    afterState?: unknown;
    metadata?: unknown;
  }
): Promise<void> {
  const tenantId =
    input.tenantId.trim();

  if (!tenantId) {
    return;
  }

  try {
    await recordAuditEvent({
      tenantId,
      actor: {
        id:
          input.actor.id,

        role:
          input.actor.role,

        tenantId:
          input.actor.tenantId,
      },
      actorType: "USER",
      entityType:
        "CommunicationCampaign",
      entityId:
        input.campaign.id,
      resourceType:
        "CommunicationCampaign",
      resourceId:
        input.campaign.id,
      action:
        input.action,
      outcome:
        input.outcome,
      result:
        input.result ?? input.outcome,
      reason:
        input.reason ?? null,
      beforeState:
        input.beforeState,
      afterState:
        input.afterState,
      metadata:
        input.metadata,
    });
  } catch (error) {
    log.warn(
      {
        event:
          "communication.launch.audit_failed",

        communicationCampaignId:
          input.campaign.id,

        error:
          normalizeError(
            error
          ),
      },
      "Communication campaign launch audit could not be recorded"
    );
  }
}
