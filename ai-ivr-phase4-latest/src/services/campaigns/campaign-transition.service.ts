import {
  AuditEventOutcome,
  CampaignStatus,
  UserRole,
} from "@prisma/client";

import type {
  Prisma,
} from "@prisma/client";

import type {
  AuthenticatedUser,
} from "@/lib/auth";

import {
  prisma,
} from "@/lib/prisma";

export type CampaignTransitionKind =
  | "LAUNCH"
  | "BEGIN_RUN"
  | "COMPLETE"
  | "FAIL"
  | "PAUSE"
  | "RESUME"
  | "CANCEL";

export interface TransitionCampaignInput {
  campaignId: string;
  actor?: Pick<
    AuthenticatedUser,
    "id" | "role" | "tenantId"
  > | null;
  requestedTransition:
    CampaignTransitionKind;
  targetStatus?: CampaignStatus;
  reason?: string | null;
}

type CampaignSnapshot = {
  id: string;
  status: CampaignStatus;
  ownerUserId: string | null;
  ownerUser: {
    tenantId: string | null;
  } | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

type CampaignClient = Pick<
  Prisma.TransactionClient,
  "campaign" | "auditEvent"
>;

export async function transitionCampaign(
  input: TransitionCampaignInput
): Promise<CampaignSnapshot> {
  return transitionCampaignOnClient(
    prisma as unknown as CampaignClient,
    input
  );
}

export async function transitionCampaignInTransaction(
  transaction: Prisma.TransactionClient,
  input: TransitionCampaignInput
): Promise<CampaignSnapshot> {
  return transitionCampaignOnClient(
    transaction as unknown as CampaignClient,
    input
  );
}

async function transitionCampaignOnClient(
  client: CampaignClient,
  input: TransitionCampaignInput
): Promise<CampaignSnapshot> {
  const campaignId =
    input.campaignId.trim();

  if (!campaignId) {
    throw new Error("Campaign ID is required");
  }

  const actor =
    input.actor ?? null;

  const campaign =
    await client.campaign.findUnique({
      where: {
        id: campaignId,
      },

      select: {
        id: true,
        status: true,
        ownerUserId: true,
        ownerUser: {
          select: {
            tenantId: true,
          },
        },
        startedAt: true,
        completedAt: true,
      },
    });

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  if (
    actor &&
    actor.role !== UserRole.SUPER_ADMIN
  ) {
    const actorTenantId =
      actor?.tenantId?.trim() ?? "";

    const campaignTenantId =
      campaign.ownerUser?.tenantId?.trim() ?? "";

    if (!actorTenantId) {
      throw new Error(
        "Tenant ID is required for campaign transitions"
      );
    }

    if (
      campaignTenantId !==
      actorTenantId
    ) {
      throw new Error(
        "Campaign not found"
      );
    }
  }

  const nextStatus =
    resolveNextStatus(
      campaign.status,
      input
    );

  const allowed =
    isTransitionAllowed(
      campaign.status,
      nextStatus,
      input.requestedTransition
    );

  if (!allowed) {
    throw new Error(
      `Campaign cannot transition from ${campaign.status} to ${nextStatus}`
    );
  }

  const updatedAt =
    new Date();

  const updated =
    await client.campaign.updateMany({
      where: {
        id: campaign.id,
        status: campaign.status,
      },

      data: {
        status: nextStatus,
        startedAt:
          input.requestedTransition === "LAUNCH"
            ? null
            : input.requestedTransition === "BEGIN_RUN"
              ? updatedAt
              : campaign.startedAt,
        completedAt:
          input.requestedTransition === "LAUNCH"
            ? null
            : isTerminalTransition(
                input.requestedTransition
              )
              ? updatedAt
              : campaign.completedAt,
      },
    });

  if (updated.count === 0) {
    throw new Error(
      "Campaign changed while transition was being recorded"
    );
  }

  await client.auditEvent.create({
    data: {
      tenantId:
        campaign.ownerUser?.tenantId ??
        actor?.tenantId ??
        "",

      actorUserId:
        actor?.id ?? null,

      actorRole:
        actor?.role ?? null,

      entityType:
        "Campaign",

      entityId:
        campaign.id,

      action:
        input.requestedTransition,

      outcome:
        AuditEventOutcome.SUCCEEDED,

      reason:
        input.reason?.trim() || null,

      beforeState: {
        status:
          campaign.status,

        startedAt:
          campaign.startedAt?.toISOString() ??
          null,

        completedAt:
          campaign.completedAt?.toISOString() ??
          null,
      },

      afterState: {
        status:
          nextStatus,

        startedAt:
          input.requestedTransition === "LAUNCH"
            ? null
            : input.requestedTransition === "BEGIN_RUN"
            ? updatedAt.toISOString()
            : campaign.startedAt?.toISOString() ??
              null,

        completedAt:
          input.requestedTransition === "LAUNCH"
            ? null
            : isTerminalTransition(
                input.requestedTransition
              )
              ? updatedAt.toISOString()
              : campaign.completedAt?.toISOString() ??
                null,
      },
    },
  });

  return {
    id: campaign.id,
    status: nextStatus,
    ownerUserId: campaign.ownerUserId,
    ownerUser: campaign.ownerUser,
    startedAt:
      input.requestedTransition === "LAUNCH"
        ? null
        : input.requestedTransition === "BEGIN_RUN"
        ? updatedAt
        : campaign.startedAt,
    completedAt:
      input.requestedTransition === "LAUNCH"
        ? null
        : isTerminalTransition(
            input.requestedTransition
          )
          ? updatedAt
          : campaign.completedAt,
  };
}

function resolveNextStatus(
  currentStatus: CampaignStatus,
  input: TransitionCampaignInput
): CampaignStatus {
  switch (input.requestedTransition) {
    case "LAUNCH":
      if (
        input.targetStatus !==
          CampaignStatus.QUEUED &&
        input.targetStatus !==
          CampaignStatus.SCHEDULED
      ) {
        throw new Error(
          "Launch transitions must target QUEUED or SCHEDULED"
        );
      }

      return input.targetStatus;

    case "BEGIN_RUN":
      return CampaignStatus.RUNNING;

    case "COMPLETE":
      return CampaignStatus.COMPLETED;

    case "FAIL":
      return CampaignStatus.FAILED;

    case "PAUSE":
      return CampaignStatus.PAUSED;

    case "RESUME":
      return CampaignStatus.RUNNING;

    case "CANCEL":
      return CampaignStatus.CANCELLED;

    default:
      return currentStatus;
  }
}

function isTransitionAllowed(
  currentStatus: CampaignStatus,
  nextStatus: CampaignStatus,
  requestedTransition: CampaignTransitionKind
): boolean {
  switch (requestedTransition) {
    case "LAUNCH":
      return (
        currentStatus === CampaignStatus.DRAFT ||
        currentStatus === CampaignStatus.PAUSED ||
        currentStatus === CampaignStatus.COMPLETED ||
        currentStatus === CampaignStatus.FAILED
      );

    case "BEGIN_RUN":
      return (
        currentStatus === CampaignStatus.QUEUED ||
        currentStatus === CampaignStatus.SCHEDULED
      );

    case "COMPLETE":
      return currentStatus === CampaignStatus.RUNNING;

    case "FAIL":
      return (
        currentStatus === CampaignStatus.QUEUED ||
        currentStatus === CampaignStatus.SCHEDULED ||
        currentStatus === CampaignStatus.RUNNING
      );

    case "PAUSE":
      return currentStatus === CampaignStatus.RUNNING;

    case "RESUME":
      return currentStatus === CampaignStatus.PAUSED;

    case "CANCEL":
      return (
        currentStatus === CampaignStatus.DRAFT ||
        currentStatus === CampaignStatus.SCHEDULED ||
        currentStatus === CampaignStatus.QUEUED ||
        currentStatus === CampaignStatus.RUNNING ||
        currentStatus === CampaignStatus.PAUSED
      ) &&
        nextStatus === CampaignStatus.CANCELLED;

    default:
      return false;
  }
}

function isTerminalTransition(
  requestedTransition: CampaignTransitionKind
): boolean {
  return (
    requestedTransition === "COMPLETE" ||
    requestedTransition === "FAIL" ||
    requestedTransition === "CANCEL"
  );
}
