import {
  AuditEventOutcome,
  CommunicationCampaignStatus,
  UserRole,
} from "@prisma/client";

import {
  AuthorizationError,
} from "@/lib/auth";

import {
  prisma,
} from "@/lib/prisma";

import {
  recordAuditEvent,
} from "@/services/audit/audit-event.service";

import {
  hasCampaignCapability,
  type CampaignCapability,
} from "./campaign-capabilities";

import {
  CommunicationCampaignQueueService,
} from "./communication-campaign-queue.service";

import {
  isWithinBusinessHours,
  type BusinessHoursPolicy,
} from "@/services/telephony/agent-availability.service";
import {
  OUTBOUND_REALTIME_EVENTS,
  publishOutboundEvent,
} from "./communication-outbound-events.service";

export interface CommunicationCampaignRuntimeActor {
  id: string;
  role: UserRole;
  tenantId?: string | null;
  campaignCapabilities?: readonly CampaignCapability[];
}

export interface CommunicationCampaignRuntimeTransitionResult {
  campaignId: string;
  previousStatus: CommunicationCampaignStatus;
  status: CommunicationCampaignStatus;
  scheduledAt: string | null;
  removedPendingJobs: number;
  queueCleanupFailed: boolean;
}

const PAUSABLE_STATUSES = [
  CommunicationCampaignStatus.RUNNING,
  CommunicationCampaignStatus.SCHEDULED,
  // DISPATCHED is retained for campaigns produced by the pre-closure E.2
  // fan-out. New E.2 orchestration remains RUNNING until settlement.
  CommunicationCampaignStatus.DISPATCHED,
] as const;

const CANCELLABLE_STATUSES = [
  CommunicationCampaignStatus.QUEUED,
  CommunicationCampaignStatus.SCHEDULED,
  CommunicationCampaignStatus.RUNNING,
  CommunicationCampaignStatus.PAUSED,
  CommunicationCampaignStatus.DISPATCHED,
] as const;

export function isCommunicationRuntimeTransitionAllowed(
  from: CommunicationCampaignStatus,
  to: CommunicationCampaignStatus
): boolean {
  if (
    to === CommunicationCampaignStatus.PAUSED
  ) {
    return PAUSABLE_STATUSES.includes(
      from as typeof PAUSABLE_STATUSES[number]
    );
  }

  if (
    from === CommunicationCampaignStatus.PAUSED &&
    (
      to === CommunicationCampaignStatus.RUNNING ||
      to === CommunicationCampaignStatus.SCHEDULED
    )
  ) {
    return true;
  }

  if (
    to === CommunicationCampaignStatus.CANCELLED
  ) {
    return CANCELLABLE_STATUSES.includes(
      from as typeof CANCELLABLE_STATUSES[number]
    );
  }

  if (
    from === CommunicationCampaignStatus.SCHEDULED &&
    to === CommunicationCampaignStatus.RUNNING
  ) {
    return true;
  }

  if (
    (
      from === CommunicationCampaignStatus.RUNNING ||
      from === CommunicationCampaignStatus.DISPATCHED
    ) &&
    to === CommunicationCampaignStatus.COMPLETED
  ) {
    return true;
  }

  return false;
}

export async function pauseCommunicationCampaign(
  campaignId: string,
  actor: CommunicationCampaignRuntimeActor
): Promise<CommunicationCampaignRuntimeTransitionResult> {
  const campaign =
    await loadAuthorizedCampaign(
      campaignId,
      actor
    );

  if (
    !isCommunicationRuntimeTransitionAllowed(
      campaign.status,
      CommunicationCampaignStatus.PAUSED
    )
  ) {
    throw invalidTransition(
      campaign.status,
      CommunicationCampaignStatus.PAUSED
    );
  }

  const updated =
    await prisma.communicationCampaign.updateMany({
      where: {
        id: campaign.id,
        status: campaign.status,
      },
      data: {
        status:
          CommunicationCampaignStatus.PAUSED,
      },
    });

  assertTransitionWon(updated.count);

  await recordLifecycleAudit({
    campaign,
    actor,
    action: "campaign.paused",
    status: CommunicationCampaignStatus.PAUSED,
  });

  publishRuntimeStatus(
    campaign,
    CommunicationCampaignStatus.PAUSED
  );

  return result(
    campaign,
    CommunicationCampaignStatus.PAUSED
  );
}

export async function resumeCommunicationCampaign(
  campaignId: string,
  actor: CommunicationCampaignRuntimeActor,
  now = new Date()
): Promise<CommunicationCampaignRuntimeTransitionResult> {
  const campaign =
    await loadAuthorizedCampaign(
      campaignId,
      actor
    );

  const policy =
    parseBusinessHoursPolicy(
      campaign.businessHoursPolicy
    );

  let effectiveScheduledAt =
    campaign.scheduledAt;

  if (
    !(
      effectiveScheduledAt &&
      effectiveScheduledAt.getTime() >
        now.getTime()
    ) &&
    policy &&
    !isWithinBusinessHours(
      policy,
      now
    )
  ) {
    effectiveScheduledAt =
      findNextBusinessWindow(
        policy,
        now
      );
  }

  const scheduled =
    Boolean(
      effectiveScheduledAt &&
      effectiveScheduledAt.getTime() >
        now.getTime()
    );

  const targetStatus =
    scheduled
      ? CommunicationCampaignStatus.SCHEDULED
      : CommunicationCampaignStatus.RUNNING;

  if (
    !isCommunicationRuntimeTransitionAllowed(
      campaign.status,
      targetStatus
    )
  ) {
    throw invalidTransition(
      campaign.status,
      targetStatus
    );
  }

  const updated =
    await prisma.communicationCampaign.updateMany({
      where: {
        id: campaign.id,
        status:
          CommunicationCampaignStatus.PAUSED,
      },
      data: {
        status: targetStatus,
        scheduledAt:
          scheduled
            ? effectiveScheduledAt
            : campaign.scheduledAt,
      },
    });

  assertTransitionWon(updated.count);

  const delayMs =
    scheduled && effectiveScheduledAt
      ? Math.max(
          0,
          effectiveScheduledAt.getTime() -
            now.getTime()
        )
      : 0;

  try {
    await CommunicationCampaignQueueService.enqueue(
      {
        communicationCampaignId:
          campaign.id,
      },
      delayMs
    );
  } catch (error) {
    await prisma.communicationCampaign.updateMany({
      where: {
        id: campaign.id,
        status: targetStatus,
      },
      data: {
        status:
          CommunicationCampaignStatus.PAUSED,
      },
    });

    throw error;
  }

  await recordLifecycleAudit({
    campaign,
    actor,
    action: "campaign.resumed",
    status: targetStatus,
  });

  publishRuntimeStatus(
    campaign,
    targetStatus
  );

  return result(
    {
      ...campaign,
      scheduledAt:
        effectiveScheduledAt,
    },
    targetStatus
  );
}

export async function cancelCommunicationCampaign(
  campaignId: string,
  actor: CommunicationCampaignRuntimeActor
): Promise<CommunicationCampaignRuntimeTransitionResult> {
  const campaign =
    await loadAuthorizedCampaign(
      campaignId,
      actor
    );

  if (
    !isCommunicationRuntimeTransitionAllowed(
      campaign.status,
      CommunicationCampaignStatus.CANCELLED
    )
  ) {
    throw invalidTransition(
      campaign.status,
      CommunicationCampaignStatus.CANCELLED
    );
  }

  const updated =
    await prisma.communicationCampaign.updateMany({
      where: {
        id: campaign.id,
        status: campaign.status,
      },
      data: {
        status:
          CommunicationCampaignStatus.CANCELLED,
      },
    });

  assertTransitionWon(updated.count);

  let removedPendingJobs = 0;
  let queueCleanupFailed = false;

  try {
    removedPendingJobs =
      await CommunicationCampaignQueueService.removePendingCampaignJobs(
        campaign.id
      );
  } catch {
    // Cancellation is already canonical in PostgreSQL. Workers re-check that
    // state before the boundary, so Redis cleanup is only an optimization.
    queueCleanupFailed = true;
  }

  await recordLifecycleAudit({
    campaign,
    actor,
    action: "campaign.cancelled",
    status:
      CommunicationCampaignStatus.CANCELLED,
    metadata: {
      removedPendingJobs,
      queueCleanupFailed,
    },
  });

  publishRuntimeStatus(
    campaign,
    CommunicationCampaignStatus.CANCELLED
  );

  return {
    ...result(
      campaign,
      CommunicationCampaignStatus.CANCELLED
    ),
    removedPendingJobs,
    queueCleanupFailed,
  };
}

async function loadAuthorizedCampaign(
  campaignId: string,
  actor: CommunicationCampaignRuntimeActor
) {
  const id = campaignId.trim();
  const actorTenantId =
    actor.tenantId?.trim() ?? "";

  if (!id) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  if (
    actor.role !== UserRole.SUPER_ADMIN &&
    !hasCampaignCapability(
      actor.campaignCapabilities,
      "CAMPAIGN_LAUNCH"
    )
  ) {
    throw new AuthorizationError();
  }

  const campaign =
    await prisma.communicationCampaign.findFirst({
      where: {
        id,
        ownerUser: {
          tenantId: actorTenantId,
        },
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        businessHoursPolicy: true,
        ownerUser: {
          select: {
            tenantId: true,
          },
        },
      },
    });

  if (!campaign) {
    throw new Error(
      "Communication campaign not found"
    );
  }

  return campaign;
}

function invalidTransition(
  from: CommunicationCampaignStatus,
  to: CommunicationCampaignStatus
): Error {
  return new Error(
    `Communication campaign transition ${from} -> ${to} is not allowed`
  );
}

function assertTransitionWon(
  count: number
): void {
  if (count !== 1) {
    throw new Error(
      "Communication campaign changed concurrently"
    );
  }
}

async function recordLifecycleAudit(
  input: {
    campaign: {
      id: string;
      status: CommunicationCampaignStatus;
      ownerUser: {
        tenantId: string | null;
      } | null;
    };
    actor: CommunicationCampaignRuntimeActor;
    action: string;
    status: CommunicationCampaignStatus;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const tenantId =
    input.campaign.ownerUser?.tenantId?.trim() ?? "";

  if (!tenantId) {
    return;
  }

  try {
    await recordAuditEvent({
      tenantId,
      actor: {
        id: input.actor.id,
        role: input.actor.role,
        tenantId,
      },
      entityType: "CommunicationCampaign",
      entityId: input.campaign.id,
      action: input.action,
      outcome: AuditEventOutcome.SUCCEEDED,
      beforeState: {
        status: input.campaign.status,
      },
      afterState: {
        status: input.status,
      },
      metadata: input.metadata,
    });
  } catch {
    // Runtime safety is governed by canonical state; audit is best effort in
    // the existing campaign architecture.
  }
}

function result(
  campaign: {
    id: string;
    status: CommunicationCampaignStatus;
    scheduledAt: Date | null;
  },
  status: CommunicationCampaignStatus
): CommunicationCampaignRuntimeTransitionResult {
  return {
    campaignId: campaign.id,
    previousStatus: campaign.status,
    status,
    scheduledAt:
      campaign.scheduledAt?.toISOString() ??
      null,
    removedPendingJobs: 0,
    queueCleanupFailed: false,
  };
}

function publishRuntimeStatus(
  campaign: {
    id: string;
    ownerUser: {
      tenantId: string | null;
    } | null;
  },
  status: CommunicationCampaignStatus
): void {
  const tenantId = campaign.ownerUser?.tenantId?.trim() ?? "";
  if (!tenantId) return;
  publishOutboundEvent(
    OUTBOUND_REALTIME_EVENTS.PROGRESS_UPDATED,
    {
      tenantId,
      campaignId: campaign.id,
    },
    { status }
  );
}

function parseBusinessHoursPolicy(
  value: unknown
): BusinessHoursPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const policy = value as Record<string, unknown>;
  const enabledDays = policy.enabledDays;

  if (
    typeof policy.timezone !== "string" ||
    typeof policy.startTime !== "string" ||
    typeof policy.endTime !== "string" ||
    !Array.isArray(enabledDays) ||
    !enabledDays.every(
      day =>
        Number.isInteger(day) &&
        Number(day) >= 0 &&
        Number(day) <= 6
    )
  ) {
    throw new Error(
      "Communication campaign business-hours policy is invalid"
    );
  }

  return {
    timezone: policy.timezone,
    startTime: policy.startTime,
    endTime: policy.endTime,
    enabledDays: enabledDays.map(Number),
  };
}

function findNextBusinessWindow(
  policy: BusinessHoursPolicy,
  now: Date
): Date {
  const start =
    new Date(
      Math.ceil(
        now.getTime() /
          60_000
      ) * 60_000
    );

  for (
    let offset = 0;
    offset <= 8 * 24 * 60;
    offset += 1
  ) {
    const candidate =
      new Date(
        start.getTime() +
          offset * 60_000
      );

    if (
      isWithinBusinessHours(
        policy,
        candidate
      )
    ) {
      return candidate;
    }
  }

  throw new Error(
    "Communication campaign has no available business-hours window"
  );
}
