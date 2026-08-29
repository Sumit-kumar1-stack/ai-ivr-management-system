import {
  AuditEventOutcome,
  CommunicationCampaignApprovalStatus,
  CommunicationCampaignStatus,
  CommunicationOutboundAttemptStatus,
  CommunicationRecipientStatus,
  SubscriptionStatus,
  TenantStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getPlivoEnvironment } from "@/config/env";
import { getPlivoPublicCallbackUrl } from "@/lib/plivo-public-url";
import { recordAuditEvent } from "@/services/audit/audit-event.service";
import { resolveTenantBillingContextForTenant } from "@/services/billing/tenant-subscription.service";
import type { BusinessHoursPolicy } from "@/services/telephony/agent-availability.service";

import {
  CommunicationCampaignQueueService,
  type CommunicationRecipientAttemptJobData,
} from "./communication-campaign-queue.service";
import { tryFinalizeCommunicationCampaign } from "./communication-campaign-finalizer.service";
import { assertCommunicationCampaignEntitlements } from "./communication-entitlement.service";
import {
  acquireOutboundCapacity,
  releaseOutboundCapacity,
  resolveOutboundCapacityPolicy,
} from "./communication-outbound-capacity.service";
import {
  buildOutboundAudienceSnapshot,
  evaluateOutboundContactEligibility,
} from "./outbound-campaign-validation.service";
import {
  executeOutboundCallAttempt,
  type ExecuteOutboundCallAttemptInput,
  type ExecuteOutboundCallAttemptResult,
} from "./communication-outbound-call-executor.service";
import { resolveCommunicationVoiceRuntime } from "./communication-entitlement.service";
import { decideOutboundRetry } from "./communication-outbound-retry-policy.service";
import {
  OUTBOUND_REALTIME_EVENTS,
  publishOutboundEvent,
} from "./communication-outbound-events.service";

export const SKIPPED_CAMPAIGN_NOT_RUNNABLE =
  "SKIPPED_CAMPAIGN_NOT_RUNNABLE" as const;

export interface OutboundCampaignLaunchPreparation {
  launchable: boolean;
  campaignId: string;
  tenantId: string;
  snapshotId: string | null;
  audienceCount: number;
  eligibleCount: number;
  excludedCount: number;
  deferredCount: number;
  queuedCount: number;
  reasonCode?: string;
  reasonText?: string;
}

export interface OutboundCampaignExecutionResult {
  communicationCampaignId: string;
  audienceCount: number;
  eligibleCount: number;
  excludedCount: number;
  deferredCount: number;
  queuedCount: number;
  skippedCount: number;
  dryRun: boolean;
  reasonCode?: string;
}

export interface ExecuteOutboundCampaignAttemptInput {
  jobVersion: number;
  tenantId: string;
  campaignId: string;
  campaignRecipientId: string;
  contactId: string;
  attemptNumber: number;
  scheduledFor: string;
  now?: Date;
}

export interface ScheduleOutboundRetryInput {
  tenantId: string;
  campaignId: string;
  campaignRecipientId: string;
  contactId: string;
  previousAttemptNumber: number;
  scheduledFor: Date;
  now?: Date;
}

export interface ScheduleOutboundRetryResult {
  scheduled: boolean;
  attemptNumber: number | null;
  reasonCode: string;
}

export interface OutboundAttemptExecutionDependencies {
  providerBoundary?: (
    input: CommunicationRecipientAttemptJobData
  ) => Promise<void>;
  outboundExecutor?: (
    input: ExecuteOutboundCallAttemptInput
  ) => Promise<ExecuteOutboundCallAttemptResult>;
}

const RUNNABLE_STATUSES = [
  CommunicationCampaignStatus.RUNNING,
  // Backward compatibility for campaigns fanned out by the partial E.2 pass.
  CommunicationCampaignStatus.DISPATCHED,
] as const;

const RETRYABLE_ATTEMPT_STATUSES = new Set<CommunicationOutboundAttemptStatus>([
  CommunicationOutboundAttemptStatus.BUSY,
  CommunicationOutboundAttemptStatus.NO_ANSWER,
  CommunicationOutboundAttemptStatus.FAILED,
  CommunicationOutboundAttemptStatus.PROVIDER_ERROR,
]);

export class OutboundCapacityUnavailableError extends Error {
  readonly code = "OUTBOUND_CAPACITY_UNAVAILABLE" as const;

  constructor(readonly dimension: string) {
    super(`Outbound ${dimension} concurrency capacity is unavailable`);
    this.name = "OutboundCapacityUnavailableError";
  }
}

export async function prepareOutboundCampaignLaunch(input: {
  campaignId: string;
  tenantId: string;
  requestedByUserId: string;
  now: Date;
}): Promise<OutboundCampaignLaunchPreparation> {
  const campaignId = input.campaignId.trim();
  const requestedTenantId = input.tenantId.trim();

  if (!campaignId) {
    throw new Error("Communication campaign ID is required");
  }

  const campaign = await prisma.communicationCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      name: true,
      status: true,
      approvalRequired: true,
      approvalStatus: true,
      currentRevision: true,
      approvedRevision: true,
      archivedAt: true,
      tier: true,
      channels: true,
      smartChanneling: true,
      fallbackPolicy: true,
      ownerUserId: true,
      timezone: true,
      businessHoursPolicy: true,
      ownerUser: { select: { tenantId: true } },
      _count: { select: { recipients: true } },
    },
  });

  if (!campaign) {
    return blockedLaunch(campaignId, requestedTenantId, "CAMPAIGN_NOT_FOUND", "Communication campaign not found");
  }

  const tenantId = campaign.ownerUser?.tenantId?.trim() ?? "";
  if (!tenantId) {
    return blockedLaunch(campaignId, requestedTenantId, "TENANT_MISSING", "Communication campaign tenant not found");
  }

  if (requestedTenantId && requestedTenantId !== tenantId) {
    return blockedLaunch(campaignId, requestedTenantId, "TENANT_MISMATCH", "Communication campaign does not belong to the requested tenant");
  }

  if (
    campaign.archivedAt ||
    campaign.status === CommunicationCampaignStatus.ARCHIVED ||
    campaign.status === CommunicationCampaignStatus.CANCELLED ||
    campaign.status === CommunicationCampaignStatus.PAUSED ||
    campaign.status === CommunicationCampaignStatus.COMPLETED ||
    campaign.status === CommunicationCampaignStatus.FAILED
  ) {
    return blockedLaunch(
      campaignId,
      tenantId,
      "CAMPAIGN_NOT_LAUNCHABLE",
      `Communication campaign cannot be launched while status is ${campaign.status}`
    );
  }

  const billing = await resolveTenantBillingContextForTenant(tenantId);

  if (
    billing.tenantStatus !== TenantStatus.ACTIVE ||
    billing.subscription.status !== SubscriptionStatus.ACTIVE
  ) {
    return blockedLaunch(campaignId, tenantId, "SUBSCRIPTION_INACTIVE", "Tenant subscription is not active");
  }

  if (
    campaign.approvalRequired &&
    campaign.approvalStatus !== CommunicationCampaignApprovalStatus.APPROVED
  ) {
    return blockedLaunch(campaignId, tenantId, "CAMPAIGN_NOT_APPROVED", "Communication campaign is not approved for launch");
  }

  if (
    campaign.approvalRequired &&
    campaign.approvedRevision !== campaign.currentRevision
  ) {
    return blockedLaunch(campaignId, tenantId, "STALE_APPROVAL", "Communication campaign approval is stale or no longer valid");
  }

  assertCommunicationCampaignEntitlements({
    tier: billing.effectiveCampaignTier,
    channels: campaign.channels,
    smartChanneling: campaign.smartChanneling,
    fallbackPolicy: campaign.fallbackPolicy,
    recipientCount: campaign._count.recipients,
  });

  const recipients = await prisma.communicationCampaignRecipient.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    select: recipientSnapshotSelect,
  });

  const snapshot = buildOutboundAudienceSnapshot({
    sourceId: campaign.ownerUserId,
    sourceName: campaign.name,
    tenantId,
    contacts: recipients.map(recipient => ({
      id: recipient.id,
      tenantId,
      ownerUserId: campaign.ownerUserId,
      fullName: recipient.fullName,
      phone: recipient.phone,
      language: recipient.language,
      consentStatus: normalizeConsentStatus(recipient.consentStatus),
      dnc: recipient.dnc,
      suppressed: recipient.suppressed,
      timezone: recipient.timezone,
      attemptCount: recipient.attemptCount,
      totalAttemptCount: recipient.attemptCount,
      lastDisposition: recipient.lastError,
    })),
  });

  let eligibleCount = 0;
  let excludedCount = 0;
  let deferredCount = 0;

  for (const recipient of snapshot.recipients) {
    const eligibility = evaluateOutboundContactEligibility({
      tenant: { tenantId },
      campaign: {
        id: campaign.id,
        tenantId,
        ownerUserId: campaign.ownerUserId,
        status: campaign.status,
        approvalStatus: campaign.approvalStatus,
        consentRequired: true,
        dncRequired: true,
        timezone: campaign.timezone,
        businessHoursPolicy: parseBusinessHoursPolicy(campaign.businessHoursPolicy),
        recipientCount: snapshot.recipientCount,
      },
      contact: recipient,
      now: input.now,
      strictCampaignState: false,
      strictBusinessHours: true,
    });

    if (eligibility.allowed) eligibleCount += 1;
    else if (isDeferredReason(eligibility.reasonCode)) deferredCount += 1;
    else excludedCount += 1;
  }

  return {
    launchable: eligibleCount > 0,
    campaignId,
    tenantId,
    snapshotId: campaignId,
    audienceCount: snapshot.recipientCount,
    eligibleCount,
    excludedCount,
    deferredCount,
    queuedCount: eligibleCount,
    reasonCode: eligibleCount > 0 ? undefined : "NO_ELIGIBLE_CONTACTS",
    reasonText: eligibleCount > 0 ? undefined : "No eligible contacts remain after eligibility filtering.",
  };
}

export async function orchestrateOutboundCampaignLaunch(input: {
  campaignId: string;
  tenantId: string;
  requestedByUserId: string;
  now: Date;
}): Promise<OutboundCampaignExecutionResult> {
  const campaignId = input.campaignId.trim();

  const claimed = await prisma.communicationCampaign.updateMany({
    where: {
      id: campaignId,
      status: {
        in: [CommunicationCampaignStatus.QUEUED, CommunicationCampaignStatus.SCHEDULED],
      },
    },
    data: { status: CommunicationCampaignStatus.RUNNING },
  });

  if (claimed.count === 0) {
    const current = await prisma.communicationCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });

    if (!current) throw new Error("Communication campaign not found");

    if (
      current.status === CommunicationCampaignStatus.COMPLETED ||
      current.status === CommunicationCampaignStatus.CANCELLED ||
      current.status === CommunicationCampaignStatus.FAILED ||
      current.status === CommunicationCampaignStatus.PAUSED
    ) {
      return emptyExecution(campaignId, SKIPPED_CAMPAIGN_NOT_RUNNABLE);
    }

    // RUNNING/DISPATCHED is resumable. Durable attempt rows and deterministic
    // BullMQ IDs make repeated launch/scheduler delivery harmless.
    if (!isRunnableStatus(current.status)) {
      throw new Error(`Communication campaign cannot execute while status is ${current.status}`);
    }
  }

  const preparation = await prepareOutboundCampaignLaunch(input);
  if (!preparation.launchable) await denyExecution(preparation);

  const campaign = await prisma.communicationCampaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      ownerUserId: true,
      maxAttempts: true,
      timezone: true,
      businessHoursPolicy: true,
      ownerUser: { select: { tenantId: true } },
    },
  });

  if (!isRunnableStatus(campaign.status)) {
    return emptyExecution(campaignId, SKIPPED_CAMPAIGN_NOT_RUNNABLE);
  }

  const tenantId = campaign.ownerUser?.tenantId?.trim() || input.tenantId.trim();
  const recipients = await prisma.communicationCampaignRecipient.findMany({
    where: {
      campaignId,
      status: { in: [CommunicationRecipientStatus.PENDING, CommunicationRecipientStatus.PROCESSING] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } }],
    },
    orderBy: { createdAt: "asc" },
    select: recipientSnapshotSelect,
  });

  let queuedCount = 0;
  let excludedCount = 0;
  let deferredCount = 0;
  let skippedCount = 0;

  for (const recipient of recipients) {
    if (recipient.status === CommunicationRecipientStatus.PROCESSING) {
      skippedCount += 1;
      continue;
    }

    const attemptNumber = recipient.attemptCount + 1;
    if (attemptNumber > campaign.maxAttempts) {
      await prisma.communicationCampaignRecipient.updateMany({
        where: { id: recipient.id, campaignId, status: CommunicationRecipientStatus.PENDING },
        data: {
          status: CommunicationRecipientStatus.FAILED,
          lastError: "Maximum outbound attempts reached",
          nextAttemptAt: null,
        },
      });
      excludedCount += 1;
      skippedCount += 1;
      continue;
    }

    const eligibility = evaluateRecipientEligibility({ campaign, recipient, tenantId, now: input.now });
    if (!eligibility.allowed) {
      if (isDeferredReason(eligibility.reasonCode)) deferredCount += 1;
      else {
        excludedCount += 1;
        await prisma.communicationCampaignRecipient.updateMany({
          where: { id: recipient.id, campaignId, status: CommunicationRecipientStatus.PENDING },
          data: {
            status: CommunicationRecipientStatus.SKIPPED,
            lastError: eligibility.reasonText,
            nextAttemptAt: null,
          },
        });
      }
      skippedCount += 1;
      continue;
    }

    const contactId = recipient.externalRecipientId?.trim() || recipient.id;
    const scheduledFor = recipient.nextAttemptAt ?? input.now;
    const attempt = await prisma.communicationOutboundAttempt.upsert({
      where: {
        campaignRecipientId_attemptNumber: { campaignRecipientId: recipient.id, attemptNumber },
      },
      create: {
        tenantId,
        campaignId,
        campaignRecipientId: recipient.id,
        contactId,
        attemptNumber,
        scheduledFor,
      },
      update: {},
    });

    if (
      attempt.status === CommunicationOutboundAttemptStatus.COMPLETED ||
      attempt.status === CommunicationOutboundAttemptStatus.CLAIMED
    ) {
      skippedCount += 1;
      continue;
    }

    await CommunicationCampaignQueueService.enqueueRecipientAttempt(
      buildAttemptJob({ tenantId, campaignId, campaignRecipientId: recipient.id, contactId, attemptNumber, scheduledFor }),
      Math.max(0, scheduledFor.getTime() - input.now.getTime())
    );
    queuedCount += 1;
  }

  await recordFanoutAudit({ tenantId, campaignId, queuedCount, excludedCount, deferredCount });
  await tryFinalizeCommunicationCampaign(campaignId);

  return {
    communicationCampaignId: campaignId,
    audienceCount: recipients.length,
    eligibleCount: queuedCount,
    excludedCount,
    deferredCount,
    queuedCount,
    skippedCount,
    dryRun: true,
  };
}

export async function executeOutboundCampaignAttempt(
  input: ExecuteOutboundCampaignAttemptInput,
  dependencies: OutboundAttemptExecutionDependencies = {}
): Promise<OutboundCampaignExecutionResult> {
  if (!isValidAttemptInput(input)) {
    return emptyExecution(input.campaignId.trim() || "unknown", "INVALID_JOB_PAYLOAD");
  }

  const now = input.now ?? new Date();
  const tenantId = input.tenantId.trim();
  const campaignId = input.campaignId.trim();
  const campaignRecipientId = input.campaignRecipientId.trim();
  const context = await loadAttemptContext({ tenantId, campaignId, campaignRecipientId, attemptNumber: input.attemptNumber });

  if (!context) return emptyExecution(campaignId, "ATTEMPT_NOT_FOUND");
  if (!isRunnableStatus(context.campaign.status)) {
    return emptyExecution(campaignId, SKIPPED_CAMPAIGN_NOT_RUNNABLE);
  }

  if (
    context.recipient.status === CommunicationRecipientStatus.COMPLETED ||
    context.recipient.status === CommunicationRecipientStatus.FAILED ||
    context.recipient.status === CommunicationRecipientStatus.SKIPPED
  ) {
    return emptyExecution(campaignId, "RECIPIENT_TERMINAL");
  }

  const eligibility = evaluateRecipientEligibility({
    campaign: context.campaign,
    recipient: context.recipient,
    tenantId,
    now,
  });

  if (!eligibility.allowed) {
    const deferred = isDeferredReason(eligibility.reasonCode);
    await prisma.communicationOutboundAttempt.updateMany({
      where: { id: context.attempt.id, status: CommunicationOutboundAttemptStatus.QUEUED },
      data: {
        status: deferred ? CommunicationOutboundAttemptStatus.QUEUED : CommunicationOutboundAttemptStatus.SKIPPED,
        failureReason: eligibility.reasonText,
      },
    });
    if (!deferred) {
      await prisma.communicationCampaignRecipient.updateMany({
        where: { id: campaignRecipientId, campaignId, status: CommunicationRecipientStatus.PENDING },
        data: {
          status: CommunicationRecipientStatus.SKIPPED,
          lastError: eligibility.reasonText,
          nextAttemptAt: null,
        },
      });
    }
    await tryFinalizeCommunicationCampaign(campaignId);
    return emptyExecution(campaignId, eligibility.reasonCode);
  }

  if (context.attempt.status !== CommunicationOutboundAttemptStatus.QUEUED) {
    if (RETRYABLE_ATTEMPT_STATUSES.has(context.attempt.status)) {
      const retryDecision = decideOutboundRetry({
        attemptNumber: context.attempt.attemptNumber,
        maxAttempts: context.campaign.maxAttempts,
        outcome: context.attempt.status,
        campaignStatus: context.campaign.status,
        recipientStatus: context.recipient.status,
        eligible: true,
        now: context.attempt.completedAt ?? now,
        businessHoursPolicy: parseBusinessHoursPolicy(context.campaign.businessHoursPolicy),
      });
      if (retryDecision.decision !== "DO_NOT_RETRY" && retryDecision.scheduledFor) {
        await scheduleOutboundRetry({
          tenantId,
          campaignId,
          campaignRecipientId,
          contactId: input.contactId.trim(),
          previousAttemptNumber: input.attemptNumber,
          scheduledFor: retryDecision.scheduledFor,
          now,
        });
      }
      return emptyExecution(campaignId, retryDecision.reasonCode);
    }
    return emptyExecution(
      campaignId,
      context.attempt.status === CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING
        ? "PROVIDER_REQUEST_AMBIGUOUS"
        : "ATTEMPT_ALREADY_ACTIVE_OR_TERMINAL"
    );
  }

  const claim = await prisma.communicationOutboundAttempt.updateMany({
    where: {
      id: context.attempt.id,
      tenantId,
      campaignId,
      status: CommunicationOutboundAttemptStatus.QUEUED,
    },
    data: {
      status: CommunicationOutboundAttemptStatus.CLAIMED,
      claimedAt: now,
      failureReason: null,
    },
  });

  if (claim.count !== 1) return emptyExecution(campaignId, "ATTEMPT_ALREADY_CLAIMED");

  const policy = resolveOutboundCapacityPolicy({
    tier: context.campaign.tier,
    campaignLimit: context.campaign.concurrencyLimit,
    provider: context.campaign.outboundProvider,
  });
  let capacityAcquired = false;
  let keepCapacity = false;
  let providerReturnedAcceptance = false;

  try {
    const capacity = await acquireOutboundCapacity({
      attemptId: context.attempt.id,
      tenantId,
      campaignId,
      provider: policy.provider,
      limits: policy.limits,
      now,
      leaseDurationMs: 4 * 60 * 60 * 1000,
    });

    if (!capacity.acquired) {
      await revertAttemptClaim(context.attempt.id);
      throw new OutboundCapacityUnavailableError(capacity.blockedDimension ?? "effective");
    }
    capacityAcquired = true;

    // Reload canonical state immediately before the provider boundary.
    const immediateState = await prisma.communicationCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    if (!immediateState || !isRunnableStatus(immediateState.status)) {
      await revertAttemptClaim(context.attempt.id);
      return emptyExecution(campaignId, SKIPPED_CAMPAIGN_NOT_RUNNABLE);
    }

    const recipientClaim = await prisma.communicationCampaignRecipient.updateMany({
      where: {
        id: campaignRecipientId,
        campaignId,
        status: { in: [CommunicationRecipientStatus.PENDING, CommunicationRecipientStatus.PROCESSING] },
        attemptCount: { lt: input.attemptNumber },
      },
      data: {
        status: CommunicationRecipientStatus.PROCESSING,
        attemptCount: input.attemptNumber,
        lastError: null,
        nextAttemptAt: null,
      },
    });

    if (recipientClaim.count !== 1) {
      await revertAttemptClaim(context.attempt.id);
      throw new Error("Outbound recipient execution claim failed");
    }

    const boundaryState = await prisma.communicationCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });

    if (!boundaryState || !isRunnableStatus(boundaryState.status)) {
      await revertAttemptClaim(context.attempt.id);
      await prisma.communicationCampaignRecipient.updateMany({
        where: {
          id: campaignRecipientId,
          campaignId,
          status: CommunicationRecipientStatus.PROCESSING,
          attemptCount: input.attemptNumber,
        },
        data: {
          status: CommunicationRecipientStatus.PENDING,
          attemptCount: input.attemptNumber - 1,
        },
      });
      return emptyExecution(campaignId, SKIPPED_CAMPAIGN_NOT_RUNNABLE);
    }

    // Compliance is mutable. Re-read it after the durable recipient claim and
    // immediately before the paid provider boundary.
    const immediateRecipient = await prisma.communicationCampaignRecipient.findFirst({
      where: { id: campaignRecipientId, campaignId },
      select: recipientSnapshotSelect,
    });
    if (!immediateRecipient) {
      await revertAttemptClaim(context.attempt.id);
      throw new Error("Outbound recipient disappeared before provider execution");
    }
    const immediateEligibility = evaluateRecipientEligibility({
      campaign: context.campaign,
      recipient: immediateRecipient,
      tenantId,
      now,
    });
    if (!immediateEligibility.allowed) {
      await prisma.communicationOutboundAttempt.updateMany({
        where: { id: context.attempt.id, status: CommunicationOutboundAttemptStatus.CLAIMED },
        data: {
          status: CommunicationOutboundAttemptStatus.SKIPPED,
          completedAt: now,
          failureReason: immediateEligibility.reasonText,
        },
      });
      await prisma.communicationCampaignRecipient.updateMany({
        where: { id: campaignRecipientId, campaignId },
        data: {
          status: CommunicationRecipientStatus.SKIPPED,
          lastError: immediateEligibility.reasonText,
          nextAttemptAt: null,
        },
      });
      return emptyExecution(campaignId, immediateEligibility.reasonCode);
    }

    if (dependencies.providerBoundary) {
      // Explicitly injected E.2 test seam remains dry-run only.
      await dependencies.providerBoundary(buildAttemptJob({
        tenantId,
        campaignId,
        campaignRecipientId,
        contactId: input.contactId.trim(),
        attemptNumber: input.attemptNumber,
        scheduledFor: new Date(input.scheduledFor),
      }));
      await prisma.communicationOutboundAttempt.updateMany({
        where: { id: context.attempt.id, status: CommunicationOutboundAttemptStatus.CLAIMED },
        data: { status: CommunicationOutboundAttemptStatus.COMPLETED, completedAt: now, failureReason: null },
      });
      await prisma.communicationCampaignRecipient.updateMany({
        where: { id: campaignRecipientId, campaignId, status: CommunicationRecipientStatus.PROCESSING },
        data: { status: CommunicationRecipientStatus.COMPLETED, lastError: null, nextAttemptAt: null },
      });
    } else {
      // Subscription state can change after launch. Re-read it at the last
      // application-controlled point before the paid provider request.
      const boundaryBilling = await resolveTenantBillingContextForTenant(tenantId);
      if (
        !boundaryBilling.launchAllowed ||
        boundaryBilling.tenantStatus !== TenantStatus.ACTIVE ||
        boundaryBilling.subscription.status !== SubscriptionStatus.ACTIVE
      ) {
        throw new Error("Tenant subscription is not active at the provider boundary");
      }
      assertCommunicationCampaignEntitlements({
        tier: boundaryBilling.effectiveCampaignTier,
        channels: context.campaign.channels,
        smartChanneling: context.campaign.smartChanneling,
        fallbackPolicy: context.campaign.fallbackPolicy,
        recipientCount: context.campaign.recipientCount,
      });
      if (
        resolveCommunicationVoiceRuntime(context.campaign.tier) === "GEMINI_LIVE" &&
        !boundaryBilling.premiumVoiceEnabled
      ) {
        throw new Error("Premium voice is not entitled at the provider boundary");
      }

      const runtime = resolveCommunicationVoiceRuntime(context.campaign.tier);
      const requesting = await prisma.communicationOutboundAttempt.updateMany({
        where: {
          id: context.attempt.id,
          tenantId,
          campaignId,
          status: CommunicationOutboundAttemptStatus.CLAIMED,
          providerCallId: null,
        },
        data: {
          status: CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING,
          provider: policy.provider,
          providerRequestedAt: now,
          requestedRuntime: runtime,
          effectiveRuntime: runtime,
          failureReason: null,
        },
      });
      if (requesting.count !== 1) {
        keepCapacity = true;
        return emptyExecution(campaignId, "PROVIDER_REQUEST_AMBIGUOUS");
      }

      await recordAttemptAudit({
        tenantId,
        campaignId,
        attemptId: context.attempt.id,
        action: "OUTBOUND_PROVIDER_REQUESTING",
        metadata: { provider: policy.provider, attemptNumber: input.attemptNumber },
      });

      const executor = dependencies.outboundExecutor ?? executeOutboundCallAttempt;
      let providerResult: ExecuteOutboundCallAttemptResult;
      try {
        providerResult = await executor({
          tenantId,
          campaignId,
          campaignRecipientId,
          attemptId: context.attempt.id,
          attemptNumber: input.attemptNumber,
          provider: policy.provider,
          from: resolveOutboundCallerId(policy.provider),
          to: immediateRecipient.phone,
          answerUrl: getPlivoPublicCallbackUrl("/api/plivo/outbound/answer", { attempt: context.attempt.id }).toString(),
          statusCallbackUrl: getPlivoPublicCallbackUrl("/api/plivo/outbound/status", { attempt: context.attempt.id }).toString(),
          recordingCallbackUrl: null,
        });
        if (!providerResult.accepted || !providerResult.providerRequestId) {
          throw new Error("Outbound provider rejected the call request");
        }
      } catch (error) {
        const failure = error instanceof Error ? error.message.slice(0, 1000) : "Provider request failed";
        await prisma.communicationOutboundAttempt.updateMany({
          where: { id: context.attempt.id, status: CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING },
          data: {
            status: CommunicationOutboundAttemptStatus.PROVIDER_ERROR,
            completedAt: now,
            failureReason: failure,
          },
        });
        await prisma.communicationCampaignRecipient.updateMany({
          where: { id: campaignRecipientId, campaignId, status: CommunicationRecipientStatus.PROCESSING },
          data: { status: CommunicationRecipientStatus.PENDING, lastError: failure },
        });
        const retryDecision = decideOutboundRetry({
          attemptNumber: input.attemptNumber,
          maxAttempts: context.campaign.maxAttempts,
          outcome: CommunicationOutboundAttemptStatus.PROVIDER_ERROR,
          campaignStatus: context.campaign.status,
          recipientStatus: CommunicationRecipientStatus.PROCESSING,
          eligible: !immediateRecipient.dnc &&
            !immediateRecipient.suppressed &&
            immediateRecipient.consentStatus === "OPTED_IN",
          now,
          businessHoursPolicy: parseBusinessHoursPolicy(context.campaign.businessHoursPolicy),
        });
        if (retryDecision.decision !== "DO_NOT_RETRY" && retryDecision.scheduledFor) {
          await scheduleOutboundRetry({
            tenantId,
            campaignId,
            campaignRecipientId,
            contactId: input.contactId.trim(),
            previousAttemptNumber: input.attemptNumber,
            scheduledFor: retryDecision.scheduledFor,
            now,
          });
        }
        throw error;
      }

      providerReturnedAcceptance = true;
      // The paid side effect may now exist. A database exception during the
      // following write is ambiguous, so retain capacity for callback
      // reconciliation or the bounded lease expiry.
      keepCapacity = true;
      const accepted = await prisma.communicationOutboundAttempt.updateMany({
        where: { id: context.attempt.id, status: CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING },
        data: {
          status: CommunicationOutboundAttemptStatus.PROVIDER_ACCEPTED,
          provider: providerResult.provider,
          providerRequestId: providerResult.providerRequestId,
          providerCallId: providerResult.providerCallId,
          rawProviderStatus: providerResult.rawProviderStatus,
          providerAcceptedAt: now,
          failureReason: null,
        },
      });
      if (accepted.count !== 1) {
        throw new Error("Provider accepted the call but acceptance persistence is ambiguous");
      }
      await recordAttemptAudit({
        tenantId,
        campaignId,
        attemptId: context.attempt.id,
        action: "OUTBOUND_PROVIDER_ACCEPTED",
        metadata: { provider: providerResult.provider, attemptNumber: input.attemptNumber },
      });
    }
  } catch (error) {
    if (!(error instanceof OutboundCapacityUnavailableError)) {
      const failure = error instanceof Error ? error.message.slice(0, 1000) : "Dry-run provider boundary failed";
      if (!providerReturnedAcceptance) {
        await prisma.communicationOutboundAttempt.updateMany({
          where: { id: context.attempt.id, status: CommunicationOutboundAttemptStatus.CLAIMED },
          data: { status: CommunicationOutboundAttemptStatus.FAILED, completedAt: now, failureReason: failure },
        });
        await prisma.communicationCampaignRecipient.updateMany({
          where: { id: campaignRecipientId, campaignId, status: CommunicationRecipientStatus.PROCESSING },
          data: { status: CommunicationRecipientStatus.PENDING, lastError: failure },
        });
      }
    }
    throw error;
  } finally {
    if (capacityAcquired && !keepCapacity) await releaseOutboundCapacity(context.attempt.id);
  }

  await tryFinalizeCommunicationCampaign(campaignId);
  return {
    communicationCampaignId: campaignId,
    audienceCount: 1,
    eligibleCount: 1,
    excludedCount: 0,
    deferredCount: 0,
    queuedCount: 1,
    skippedCount: 0,
    dryRun: Boolean(dependencies.providerBoundary),
  };
}

export async function scheduleOutboundRetry(input: ScheduleOutboundRetryInput): Promise<ScheduleOutboundRetryResult> {
  const tenantId = input.tenantId.trim();
  const campaignId = input.campaignId.trim();
  const campaignRecipientId = input.campaignRecipientId.trim();
  const contactId = input.contactId.trim();
  if (!tenantId || !campaignId || !campaignRecipientId || !contactId || !Number.isInteger(input.previousAttemptNumber) || input.previousAttemptNumber < 1) {
    throw new Error("Outbound retry identifiers are invalid");
  }

  const campaign = await prisma.communicationCampaign.findFirst({
    where: { id: campaignId, ownerUser: { tenantId } },
    select: { id: true, status: true, maxAttempts: true },
  });
  const recipient = await prisma.communicationCampaignRecipient.findFirst({
    where: { id: campaignRecipientId, campaignId },
    select: { id: true, status: true, dnc: true, suppressed: true, consentStatus: true },
  });

  if (!campaign || !recipient) return { scheduled: false, attemptNumber: null, reasonCode: "RECIPIENT_NOT_FOUND" };
  if (
    campaign.status === CommunicationCampaignStatus.CANCELLED ||
    campaign.status === CommunicationCampaignStatus.COMPLETED ||
    campaign.status === CommunicationCampaignStatus.FAILED
  ) {
    return { scheduled: false, attemptNumber: null, reasonCode: "CAMPAIGN_NOT_RETRYABLE" };
  }
  if (
    recipient.status === CommunicationRecipientStatus.COMPLETED ||
    recipient.status === CommunicationRecipientStatus.SKIPPED ||
    recipient.dnc || recipient.suppressed || recipient.consentStatus !== "OPTED_IN"
  ) {
    return { scheduled: false, attemptNumber: null, reasonCode: "RECIPIENT_NOT_RETRYABLE" };
  }

  const attemptNumber = input.previousAttemptNumber + 1;
  if (attemptNumber > campaign.maxAttempts) {
    return { scheduled: false, attemptNumber: null, reasonCode: "MAX_ATTEMPTS_REACHED" };
  }

  const attempt = await prisma.communicationOutboundAttempt.upsert({
    where: { campaignRecipientId_attemptNumber: { campaignRecipientId, attemptNumber } },
    create: { tenantId, campaignId, campaignRecipientId, contactId, attemptNumber, scheduledFor: input.scheduledFor },
    update: {},
  });
  if (
    attempt.status === CommunicationOutboundAttemptStatus.COMPLETED ||
    attempt.status === CommunicationOutboundAttemptStatus.CLAIMED
  ) {
    return { scheduled: false, attemptNumber, reasonCode: "ATTEMPT_ALREADY_ACTIVE_OR_COMPLETE" };
  }

  await prisma.communicationCampaignRecipient.updateMany({
    where: {
      id: campaignRecipientId,
      campaignId,
      status: { notIn: [CommunicationRecipientStatus.COMPLETED, CommunicationRecipientStatus.SKIPPED] },
    },
    data: { status: CommunicationRecipientStatus.PENDING, nextAttemptAt: input.scheduledFor },
  });

  const now = input.now ?? new Date();
  await CommunicationCampaignQueueService.enqueueRecipientAttempt(
    buildAttemptJob({ tenantId, campaignId, campaignRecipientId, contactId, attemptNumber, scheduledFor: input.scheduledFor }),
    Math.max(0, input.scheduledFor.getTime() - now.getTime())
  );
  publishOutboundEvent(
    OUTBOUND_REALTIME_EVENTS.RETRY_SCHEDULED,
    {
      tenantId,
      campaignId,
      attemptId: attempt.id,
    },
    {
      attemptNumber,
      scheduledFor: input.scheduledFor.toISOString(),
    }
  );
  publishOutboundEvent(
    OUTBOUND_REALTIME_EVENTS.PROGRESS_UPDATED,
    {
      tenantId,
      campaignId,
      attemptId: attempt.id,
    }
  );
  return { scheduled: true, attemptNumber, reasonCode: "RETRY_SCHEDULED" };
}

export async function executeDryRunOutboundProviderBoundary(
  input: CommunicationRecipientAttemptJobData
): Promise<void> {
  // E.2 deliberately ends here. No real provider adapter is imported.
  void input;
}

const recipientSnapshotSelect = {
  id: true,
  externalRecipientId: true,
  fullName: true,
  phone: true,
  language: true,
  consentStatus: true,
  dnc: true,
  suppressed: true,
  timezone: true,
  status: true,
  lastError: true,
  attemptCount: true,
  nextAttemptAt: true,
} as const;

function evaluateRecipientEligibility(input: {
  campaign: {
    id: string;
    ownerUserId: string | null;
    status: CommunicationCampaignStatus;
    timezone?: string | null;
    businessHoursPolicy?: unknown;
  };
  recipient: {
    id: string;
    fullName: string | null;
    phone: string;
    language: string;
    consentStatus: string;
    dnc: boolean;
    suppressed: boolean;
    timezone: string | null;
    attemptCount: number;
    lastError: string | null;
  };
  tenantId: string;
  now: Date;
}) {
  return evaluateOutboundContactEligibility({
    tenant: { tenantId: input.tenantId },
    campaign: {
      id: input.campaign.id,
      tenantId: input.tenantId,
      ownerUserId: input.campaign.ownerUserId,
      status: input.campaign.status,
      approvalStatus: CommunicationCampaignApprovalStatus.APPROVED,
      consentRequired: true,
      dncRequired: true,
      timezone: input.campaign.timezone,
      businessHoursPolicy: parseBusinessHoursPolicy(input.campaign.businessHoursPolicy),
      recipientCount: 1,
    },
    contact: {
      id: input.recipient.id,
      tenantId: input.tenantId,
      ownerUserId: input.campaign.ownerUserId,
      fullName: input.recipient.fullName,
      phone: input.recipient.phone,
      language: input.recipient.language,
      consentStatus: normalizeConsentStatus(input.recipient.consentStatus),
      dnc: input.recipient.dnc,
      suppressed: input.recipient.suppressed,
      timezone: input.recipient.timezone,
      attemptCount: input.recipient.attemptCount,
      totalAttemptCount: input.recipient.attemptCount,
      lastDisposition: input.recipient.lastError,
    },
    now: input.now,
    strictCampaignState: false,
    strictBusinessHours: true,
  });
}

async function loadAttemptContext(input: {
  tenantId: string;
  campaignId: string;
  campaignRecipientId: string;
  attemptNumber: number;
}) {
  const campaign = await prisma.communicationCampaign.findFirst({
    where: { id: input.campaignId, ownerUser: { tenantId: input.tenantId } },
    select: {
      id: true,
      status: true,
      tier: true,
      concurrencyLimit: true,
      outboundProvider: true,
      ownerUserId: true,
      timezone: true,
      businessHoursPolicy: true,
      maxAttempts: true,
      channels: true,
      smartChanneling: true,
      fallbackPolicy: true,
      recipientCount: true,
    },
  });
  if (!campaign) return null;

  const recipient = await prisma.communicationCampaignRecipient.findFirst({
    where: { id: input.campaignRecipientId, campaignId: input.campaignId },
    select: recipientSnapshotSelect,
  });
  if (!recipient) return null;

  const attempt = await prisma.communicationOutboundAttempt.findUnique({
    where: {
      campaignRecipientId_attemptNumber: {
        campaignRecipientId: input.campaignRecipientId,
        attemptNumber: input.attemptNumber,
      },
    },
  });
  if (!attempt || attempt.campaignId !== input.campaignId || attempt.tenantId !== input.tenantId) return null;
  return { campaign, recipient, attempt };
}

function resolveOutboundCallerId(provider: string): string {
  if (provider === "PLIVO") return getPlivoEnvironment().callerId;
  const configured = process.env[`TELEPHONY_${provider}_CALLER_ID`]?.trim();
  if (!configured) throw new Error(`Outbound caller ID is not configured for ${provider}`);
  return configured;
}

async function recordAttemptAudit(input: {
  tenantId: string;
  campaignId: string;
  attemptId: string;
  action: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    await recordAuditEvent({
      tenantId: input.tenantId,
      actor: null,
      entityType: "CommunicationOutboundAttempt",
      entityId: input.attemptId,
      resourceType: "CommunicationCampaign",
      resourceId: input.campaignId,
      action: input.action,
      outcome: AuditEventOutcome.SUCCEEDED,
      result: "ACCEPTED",
      metadata: input.metadata,
    });
  } catch {
    // Provider execution is not rolled back by best-effort observability.
  }
}

async function revertAttemptClaim(attemptId: string): Promise<void> {
  await prisma.communicationOutboundAttempt.updateMany({
    where: { id: attemptId, status: CommunicationOutboundAttemptStatus.CLAIMED },
    data: { status: CommunicationOutboundAttemptStatus.QUEUED, claimedAt: null },
  });
}

function buildAttemptJob(input: {
  tenantId: string;
  campaignId: string;
  campaignRecipientId: string;
  contactId: string;
  attemptNumber: number;
  scheduledFor: Date;
}): CommunicationRecipientAttemptJobData {
  return {
    jobVersion: 1,
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    campaignRecipientId: input.campaignRecipientId,
    contactId: input.contactId,
    attemptNumber: input.attemptNumber,
    scheduledFor: input.scheduledFor.toISOString(),
  };
}

function isValidAttemptInput(input: ExecuteOutboundCampaignAttemptInput): boolean {
  return input.jobVersion === 1 &&
    Number.isInteger(input.attemptNumber) &&
    input.attemptNumber > 0 &&
    Boolean(input.tenantId.trim()) &&
    Boolean(input.campaignId.trim()) &&
    Boolean(input.campaignRecipientId.trim()) &&
    Boolean(input.contactId.trim()) &&
    Number.isFinite(new Date(input.scheduledFor).getTime());
}

function isRunnableStatus(status: CommunicationCampaignStatus): boolean {
  return RUNNABLE_STATUSES.includes(status as typeof RUNNABLE_STATUSES[number]);
}

function normalizeConsentStatus(value: string | null | undefined): "OPTED_IN" | "OPTED_OUT" | "UNKNOWN" {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "OPTED_IN") return "OPTED_IN";
  if (normalized === "OPTED_OUT") return "OPTED_OUT";
  return "UNKNOWN";
}

function parseBusinessHoursPolicy(value: unknown): BusinessHoursPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const policy = value as Record<string, unknown>;
  if (
    typeof policy.timezone !== "string" ||
    typeof policy.startTime !== "string" ||
    typeof policy.endTime !== "string" ||
    !Array.isArray(policy.enabledDays) ||
    !policy.enabledDays.every(day => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)
  ) {
    return null;
  }

  return {
    timezone: policy.timezone,
    startTime: policy.startTime,
    endTime: policy.endTime,
    enabledDays: policy.enabledDays.map(Number),
  };
}

function isDeferredReason(reasonCode: string): boolean {
  return reasonCode === "OUTSIDE_CALLING_HOURS";
}

function emptyExecution(campaignId: string, reasonCode?: string): OutboundCampaignExecutionResult {
  return {
    communicationCampaignId: campaignId,
    audienceCount: 0,
    eligibleCount: 0,
    excludedCount: 0,
    deferredCount: 0,
    queuedCount: 0,
    skippedCount: 1,
    dryRun: true,
    reasonCode,
  };
}

function blockedLaunch(
  campaignId: string,
  tenantId: string,
  reasonCode: string,
  reasonText: string
): OutboundCampaignLaunchPreparation {
  return {
    launchable: false,
    campaignId,
    tenantId: tenantId.trim(),
    snapshotId: null,
    audienceCount: 0,
    eligibleCount: 0,
    excludedCount: 0,
    deferredCount: 0,
    queuedCount: 0,
    reasonCode,
    reasonText,
  };
}

async function denyExecution(preparation: OutboundCampaignLaunchPreparation): Promise<never> {
  await prisma.communicationCampaign.updateMany({
    where: { id: preparation.campaignId, status: CommunicationCampaignStatus.RUNNING },
    data: { status: CommunicationCampaignStatus.FAILED },
  });
  if (preparation.tenantId) {
    try {
      await recordAuditEvent({
        tenantId: preparation.tenantId,
        actor: null,
        entityType: "CommunicationCampaign",
        entityId: preparation.campaignId,
        action: "WORKER_EXECUTION_DENIED",
        outcome: AuditEventOutcome.FAILED,
        result: "DENIED",
        reason: preparation.reasonText ?? "Communication campaign cannot be launched",
        metadata: { reasonCode: preparation.reasonCode ?? "CAMPAIGN_NOT_LAUNCHABLE" },
      });
    } catch {
      // Existing campaign audit hooks are best effort.
    }
  }
  throw new Error(preparation.reasonText ?? "Communication campaign cannot be launched");
}

async function recordFanoutAudit(input: {
  tenantId: string;
  campaignId: string;
  queuedCount: number;
  excludedCount: number;
  deferredCount: number;
}): Promise<void> {
  try {
    await recordAuditEvent({
      tenantId: input.tenantId,
      actor: null,
      entityType: "CommunicationCampaign",
      entityId: input.campaignId,
      action: "FANOUT_QUEUED",
      outcome: AuditEventOutcome.SUCCEEDED,
      afterState: { status: CommunicationCampaignStatus.RUNNING },
      metadata: {
        queuedCount: input.queuedCount,
        excludedCount: input.excludedCount,
        deferredCount: input.deferredCount,
        dryRun: true,
      },
    });
  } catch {
    // Existing campaign audit hooks are best effort.
  }
}
