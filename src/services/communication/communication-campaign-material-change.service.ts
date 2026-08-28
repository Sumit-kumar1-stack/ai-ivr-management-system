import {
  CommunicationCampaignApprovalStatus,
} from "@prisma/client";

import type {
  AuthenticatedUser,
} from "@/lib/auth";

import {
  prisma,
} from "@/lib/prisma";

import {
  transitionCommunicationCampaign,
} from "@/services/communication/communication-campaign-transition.service";

export interface CommunicationCampaignMaterialChangeActor {
  id: string;
  role: AuthenticatedUser["role"];
  tenantId?: string | null;
  campaignCapabilities?:
    AuthenticatedUser["campaignCapabilities"];
}

export async function recordCommunicationCampaignMaterialChange(
  campaignId:
    string,

  actor:
    CommunicationCampaignMaterialChangeActor
): Promise<void> {
  const id =
    campaignId.trim();

  if (!id) {
    throw new Error(
      "Communication campaign ID is required"
    );
  }

  const campaign =
    await prisma.communicationCampaign.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        approvalStatus: true,
      },
    });

  if (!campaign) {
    throw new Error(
      "Communication campaign not found"
    );
  }

  const updated =
    await prisma.communicationCampaign.updateMany({
      where: {
        id,
      },

      data: {
        currentRevision: {
          increment: 1,
        },
      },
    });

  if (updated.count === 0) {
    throw new Error(
      "Communication campaign changed while material update was being recorded"
    );
  }

  if (
    campaign.approvalStatus ===
      CommunicationCampaignApprovalStatus.APPROVED ||
    campaign.approvalStatus ===
      CommunicationCampaignApprovalStatus.REJECTED
  ) {
    await transitionCommunicationCampaign({
      campaignId: id,
      actor,
      requestedTransition: "RESET_TO_DRAFT",
    });
  }
}
