import {
  AuditEventOutcome,
  CommunicationCampaignApprovalStatus,
  CommunicationCampaignStatus,
  UserRole,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  recordAuditEvent,
} from "@/services/audit/audit-event.service";

import {
  canArchiveCampaign,
  canApproveCampaign,
  canRejectCampaign,
  canRequestChangesCampaign,
  canSubmitCampaign,
  isCampaignSelfApproval,
} from "@/services/communication/campaign-permissions";

import type {
  CampaignCapability,
} from "@/services/communication/campaign-capabilities";

export type CommunicationCampaignTransition =
  | "SUBMIT_FOR_APPROVAL"
  | "APPROVE"
  | "REJECT"
  | "REQUEST_CHANGES"
  | "RESET_TO_DRAFT"
  | "ARCHIVE";

export interface TransitionCommunicationCampaignInput {
  campaignId: string;
  actor: CampaignTransitionActor;
  requestedTransition:
    CommunicationCampaignTransition;
  reason?: string | null;
}

interface CampaignTransitionActor {
  id: string;
  role: UserRole;
  tenantId?: string | null;
  campaignCapabilities?: readonly CampaignCapability[];
}

type CampaignSnapshot = {
  id: string;
  status: CommunicationCampaignStatus;
  approvalStatus: CommunicationCampaignApprovalStatus;
  approvalRequired: boolean;
  tenantId: string | null;
  submittedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  approvedRevision: number | null;
  currentRevision: number;
  approvalReason: string | null;
  archivedAt: Date | null;
  archivedByUserId: string | null;
  ownerUserId: string | null;
  ownerUser: {
    tenantId: string | null;
  } | null;
};

export async function transitionCommunicationCampaign(
  input: TransitionCommunicationCampaignInput
): Promise<void> {
  const campaignId =
    input.campaignId.trim();

  if (!campaignId) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const campaign =
    await loadCampaign(
      campaignId,
      input.actor
    );

  if (!campaign) {
    await recordDeniedAudit({
      actor: input.actor,
      campaignId,
      reason:
        "Communication campaign not found",
    });

    throw new Error(
      "Communication campaign not found"
    );
  }

  const snapshot =
    buildSnapshot(
      campaign
    );

  try {
    switch (
      input.requestedTransition
    ) {
      case "SUBMIT_FOR_APPROVAL":
        await submitForApproval(
          campaign,
          input.actor
        );
        break;

      case "APPROVE":
        await approveCampaign(
          campaign,
          input.actor
        );
        break;

      case "REJECT":
        await rejectCampaign(
          campaign,
          input.actor,
          input.reason,
          "REJECT"
        );
        break;

      case "REQUEST_CHANGES":
        await rejectCampaign(
          campaign,
          input.actor,
          input.reason,
          "REQUEST_CHANGES"
        );
        break;

      case "RESET_TO_DRAFT":
        await resetToDraft(
          campaign,
          input.actor
        );
        break;

      case "ARCHIVE":
        await archiveCampaign(
          campaign,
          input.actor
        );
        break;

      default:
        throw new Error(
          `Unsupported communication campaign transition: ${input.requestedTransition}`
        );
    }
  } catch (
    error
  ) {
    if (
      !(
        error instanceof Error &&
        error.message ===
          "Audit event persistence failed"
      )
    ) {
      await recordDeniedAudit({
        actor: input.actor,
        campaignId,
        reason:
          error instanceof Error
            ? error.message
            : "Transition denied",
        beforeState: snapshot,
        metadata: {
          requestedTransition:
            input.requestedTransition,
        },
      });
    }

    throw error;
  }
}

async function loadCampaign(
  campaignId: string,
  actor: CampaignTransitionActor
): Promise<CampaignSnapshot | null> {
  const select = {
    id: true,
    status: true,
    approvalStatus: true,
    approvalRequired: true,
    submittedByUserId: true,
    approvedByUserId: true,
    approvedAt: true,
    approvedRevision: true,
    currentRevision: true,
    approvalReason: true,
    archivedAt: true,
    archivedByUserId: true,
    ownerUserId: true,
    ownerUser: {
      select: {
        tenantId: true,
      },
    },
  } as const;

  const platformScoped =
    actor.role === UserRole.SUPER_ADMIN;

  const tenantId =
    actor.tenantId?.trim() ?? "";

  if (!platformScoped && !tenantId) {
    throw new Error(
      "Tenant ID is required for communication campaign transitions"
    );
  }

  const campaign =
    await prisma.communicationCampaign.findFirst({
    where: {
      id: campaignId,
      ...(platformScoped
        ? {}
        : {
            ownerUser: {
              tenantId,
            },
          }),
    },

    select,
  });

  if (!campaign) {
    return null;
  }

  return {
    ...campaign,

    tenantId:
      campaign.ownerUser?.tenantId ??
      null,
  };
}

async function submitForApproval(
  campaign: CampaignSnapshot,
  actor: CampaignTransitionActor
): Promise<void> {
  if (!canSubmitCampaign(actor, campaign)) {
    throw new Error(
      `Communication campaign cannot be submitted while status is ${campaign.status}`
    );
  }

  const updated =
    await prisma.communicationCampaign.updateMany({
      where: {
        id: campaign.id,
        approvalStatus: {
          not:
            CommunicationCampaignApprovalStatus.SUBMITTED,
        },
        status: {
          in: [
            CommunicationCampaignStatus.DRAFT,
            CommunicationCampaignStatus.READY,
          ],
        },
      },

      data: {
        approvalStatus:
          CommunicationCampaignApprovalStatus.SUBMITTED,

        submittedByUserId:
          actor.id,

        submittedAt:
          new Date(),
      },
    });

  if (updated.count === 0) {
    throw new Error(
      "Communication campaign changed while submission was being recorded"
    );
  }

  await recordSuccessAudit({
    actor,
    campaign,
    action: "SUBMIT_FOR_APPROVAL",
    afterState: {
      status: CommunicationCampaignStatus.DRAFT,
      approvalStatus:
        CommunicationCampaignApprovalStatus.SUBMITTED,
      submittedByUserId: actor.id,
    },
  });
}

async function approveCampaign(
  campaign: CampaignSnapshot,
  actor: CampaignTransitionActor
): Promise<void> {
  if (isCampaignSelfApproval(actor, campaign)) {
    throw new Error(
      "The same user cannot approve their own communication campaign"
    );
  }

  if (!canApproveCampaign(actor, campaign)) {
    throw new Error(
      "User is not authorized to approve this communication campaign"
    );
  }

  if (
    campaign.approvalStatus !==
    CommunicationCampaignApprovalStatus.SUBMITTED
  ) {
    throw new Error(
      "Communication campaign must be submitted before approval"
    );
  }

  const updated =
    await prisma.communicationCampaign.updateMany({
      where: {
        id: campaign.id,
        approvalStatus:
          CommunicationCampaignApprovalStatus.SUBMITTED,
      },

      data: {
        approvalStatus:
          CommunicationCampaignApprovalStatus.APPROVED,

        approvedByUserId:
          actor.id,

        approvedAt:
          new Date(),

        approvedRevision:
          campaign.currentRevision,

        status:
          CommunicationCampaignStatus.READY,
      },
    });

  if (updated.count === 0) {
    throw new Error(
      "Communication campaign changed while approval was being recorded"
    );
  }

  await recordSuccessAudit({
    actor,
    campaign,
    action: "APPROVE",
    afterState: {
      status: CommunicationCampaignStatus.READY,
      approvalStatus:
        CommunicationCampaignApprovalStatus.APPROVED,
      approvedByUserId: actor.id,
      approvedRevision: campaign.currentRevision,
    },
  });
}

async function rejectCampaign(
  campaign: CampaignSnapshot,
  actor: CampaignTransitionActor,
  reason?: string | null,
  requestedTransition:
    | "REJECT"
    | "REQUEST_CHANGES" =
    "REJECT"
): Promise<void> {
  if (isCampaignSelfApproval(actor, campaign)) {
    throw new Error(
      requestedTransition === "REQUEST_CHANGES"
        ? "The same user cannot request changes on their own communication campaign"
        : "The same user cannot reject their own communication campaign"
    );
  }

  const canProceed =
    requestedTransition ===
      "REQUEST_CHANGES"
      ? canRequestChangesCampaign(
          actor,
          campaign
        )
      : canRejectCampaign(
          actor,
          campaign
        );

  if (!canProceed) {
    throw new Error(
      "Communication campaign cannot be rejected in its current state"
    );
  }

  if (
    campaign.approvalStatus !==
    CommunicationCampaignApprovalStatus.SUBMITTED
  ) {
    throw new Error(
      "Communication campaign must be submitted before rejection"
    );
  }

  const updated =
    await prisma.communicationCampaign.updateMany({
      where: {
        id: campaign.id,
        approvalStatus:
          CommunicationCampaignApprovalStatus.SUBMITTED,
      },

      data: {
        approvalStatus:
          CommunicationCampaignApprovalStatus.REJECTED,

        approvalReason:
          reason?.trim() || null,

        approvedByUserId:
          actor.id,

        approvedAt:
          new Date(),

        status:
          CommunicationCampaignStatus.DRAFT,
      },
    });

  if (updated.count === 0) {
    throw new Error(
      "Communication campaign changed while rejection was being recorded"
    );
  }

  await recordSuccessAudit({
    actor,
    campaign,
    action:
      requestedTransition,
    afterState: {
      status: CommunicationCampaignStatus.DRAFT,
      approvalStatus:
        CommunicationCampaignApprovalStatus.REJECTED,
      approvalReason:
        reason?.trim() || null,
      approvedByUserId: actor.id,
    },
  });
}

async function resetToDraft(
  campaign: CampaignSnapshot,
  actor: CampaignTransitionActor
): Promise<void> {
  if (
    campaign.status !==
      CommunicationCampaignStatus.READY &&
    campaign.approvalStatus !==
      CommunicationCampaignApprovalStatus.APPROVED &&
    campaign.approvalStatus !==
      CommunicationCampaignApprovalStatus.REJECTED
  ) {
    throw new Error(
      `Communication campaign cannot be reset while status is ${campaign.status}`
    );
  }

  const updated =
    await prisma.communicationCampaign.updateMany({
      where: {
        id: campaign.id,
      },

      data: {
        approvalStatus:
          CommunicationCampaignApprovalStatus.DRAFT,

        approvedByUserId: null,

        approvedAt: null,

        approvedRevision: null,

        approvalReason: null,

        status:
          CommunicationCampaignStatus.DRAFT,
      },
    });

  if (updated.count === 0) {
    throw new Error(
      "Communication campaign changed while reset was being recorded"
    );
  }

  await recordSuccessAudit({
    actor,
    campaign,
    action: "RESET_TO_DRAFT",
    afterState: {
      status: CommunicationCampaignStatus.DRAFT,
      approvalStatus:
        CommunicationCampaignApprovalStatus.DRAFT,
    },
  });
}

async function archiveCampaign(
  campaign: CampaignSnapshot,
  actor: CampaignTransitionActor
): Promise<void> {
  if (
    !canArchiveCampaign(
      actor,
      campaign
    )
  ) {
    throw new Error(
      `Communication campaign cannot be archived while status is ${campaign.status}`
    );
  }

  const archivedAt =
    new Date();

  const updated =
    await prisma.communicationCampaign.updateMany({
      where: {
        id: campaign.id,
      },

      data: {
        status:
          CommunicationCampaignStatus.ARCHIVED,

        archivedAt,

        archivedByUserId:
          actor.id,
      },
    });

  if (updated.count === 0) {
    throw new Error(
      "Communication campaign changed while archive was being recorded"
    );
  }

  await recordSuccessAudit({
    actor,
    campaign,
    action: "ARCHIVE",
    afterState: {
      status: CommunicationCampaignStatus.ARCHIVED,
      archivedAt:
        archivedAt.toISOString(),
      archivedByUserId: actor.id,
    },
  });
}

async function recordDeniedAudit(
  input: {
    actor: CampaignTransitionActor;
    campaignId: string;
    reason: string;
    snapshot?: CampaignSnapshot | null;
    beforeState?: unknown;
    metadata?: unknown;
  }
): Promise<void> {
  const tenantId =
    input.actor.tenantId?.trim() ?? "";

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

        tenantId,
      },

      entityType:
        "CommunicationCampaign",

      entityId:
        input.campaignId,

      action:
        "TRANSITION_DENIED",

      outcome:
        AuditEventOutcome.DENIED,

      reason:
        input.reason,

      beforeState:
        input.beforeState ??
        (input.snapshot
          ? buildSnapshot(
              input.snapshot
            )
          : undefined),

      metadata:
        {
          ...(input.metadata &&
          typeof input.metadata ===
            "object"
            ? (input.metadata as Record<
                string,
                unknown
              >)
            : {}),
          actorUserId:
            input.actor.id,
          tenantId,
          campaignId:
            input.campaignId,
          reason:
            input.reason,
          currentRevision:
            input.snapshot?.currentRevision ??
            null,
          approvedRevision:
            input.snapshot?.approvedRevision ??
            null,
          approvalStatus:
            input.snapshot?.approvalStatus ??
            null,
        },
    });
  } catch {
    // Best-effort audit logging only.
  }
}

async function recordSuccessAudit(
  input: {
    actor: CampaignTransitionActor;
    campaign: CampaignSnapshot;
    action: CommunicationCampaignTransition;
    afterState: Record<string, unknown>;
  }
): Promise<void> {
  const auditAction =
    input.action ===
      "SUBMIT_FOR_APPROVAL"
      ? "CAMPAIGN_SUBMITTED"
      : input.action === "APPROVE"
        ? "CAMPAIGN_APPROVED"
        : input.action === "REJECT"
          ? "CAMPAIGN_REJECTED"
          : input.action ===
              "REQUEST_CHANGES"
            ? "CAMPAIGN_CHANGES_REQUESTED"
            : input.action === "ARCHIVE"
              ? "CAMPAIGN_ARCHIVED"
              : "CAMPAIGN_UPDATED";

  try {
    await recordAuditEvent({
      tenantId:
        input.campaign.ownerUser?.tenantId ??
        input.actor.tenantId ??
        "",

      actor: {
        id:
          input.actor.id,

        role:
          input.actor.role,

        tenantId:
          input.campaign.ownerUser?.tenantId ??
          input.actor.tenantId ??
          null,
      },

      entityType:
        "CommunicationCampaign",

      entityId:
        input.campaign.id,

      action:
        auditAction,

      outcome:
        AuditEventOutcome.SUCCEEDED,

      beforeState:
        buildSnapshot(
          input.campaign
        ),

      afterState:
        input.afterState,

      metadata: {
        approvalRequired:
          input.campaign
            .approvalRequired,
        currentRevision:
          input.campaign.currentRevision,
        approvedRevision:
          input.campaign.approvedRevision,
        approvalStatus:
          input.campaign.approvalStatus,
      },
    });
  } catch (
    error
  ) {
    throw new Error(
      "Audit event persistence failed",
      {
        cause:
          error instanceof Error
            ? error
            : undefined,
      }
    );
  }
}

function buildSnapshot(
  campaign: CampaignSnapshot
): Record<string, unknown> {
  return {
    id: campaign.id,
    status: campaign.status,
    approvalStatus:
      campaign.approvalStatus,
    approvalRequired:
      campaign.approvalRequired,
    submittedByUserId:
      campaign.submittedByUserId,
    approvedByUserId:
      campaign.approvedByUserId,
    approvedAt:
      campaign.approvedAt?.toISOString() ??
      null,
    approvedRevision:
      campaign.approvedRevision,
    currentRevision:
      campaign.currentRevision,
    approvalReason:
      campaign.approvalReason,
    archivedAt:
      campaign.archivedAt?.toISOString() ??
      null,
    archivedByUserId:
      campaign.archivedByUserId,
    ownerUserId:
      campaign.ownerUserId,
    tenantId:
      campaign.ownerUser?.tenantId ??
      null,
  };
}
