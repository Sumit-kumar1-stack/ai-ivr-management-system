import {
  CommunicationCampaignApprovalStatus,
  CommunicationCampaignStatus,
  UserRole,
} from "@prisma/client";

import {
  hasCampaignCapability,
  type CampaignCapability,
} from "@/services/communication/campaign-capabilities";

export interface CampaignPermissionUser {
  id: string;
  role: UserRole;
  tenantId?: string | null;
  campaignCapabilities?: readonly CampaignCapability[];
}

export interface CampaignLifecycleSnapshot {
  status: CommunicationCampaignStatus;
  approvalStatus: CommunicationCampaignApprovalStatus;
  approvalRequired: boolean;
  tenantId: string | null;
  ownerUserId: string | null;
  submittedByUserId: string | null;
  approvedByUserId: string | null;
  currentRevision: number;
  approvedRevision: number | null;
  attemptedContactCount: number;
}

function isSameTenant(
  user: CampaignPermissionUser,
  campaignTenantId: string | null | undefined
): boolean {
  const tenantId = user.tenantId?.trim() ?? "";
  const normalizedCampaignTenantId = campaignTenantId?.trim() ?? "";

  if (!tenantId || !normalizedCampaignTenantId) {
    return false;
  }

  return tenantId === normalizedCampaignTenantId;
}

function hasCapability(
  user: CampaignPermissionUser,
  capability: CampaignCapability
): boolean {
  return hasCampaignCapability(
    user.campaignCapabilities,
    capability
  );
}

export function canCreateCampaign(
  user: CampaignPermissionUser
): boolean {
  return hasCapability(
    user,
    "CAMPAIGN_CREATE"
  );
}

export function canEditCampaign(
  user: CampaignPermissionUser,
  campaign: Pick<
    CampaignLifecycleSnapshot,
    "status" | "approvalStatus" | "tenantId"
  >
): boolean {
  return (
    hasCapability(
      user,
      "CAMPAIGN_EDIT"
    ) &&
    isSameTenant(
      user,
      campaign.tenantId
    ) &&
    (campaign.status === CommunicationCampaignStatus.DRAFT ||
      campaign.status === CommunicationCampaignStatus.READY) &&
    campaign.approvalStatus !== CommunicationCampaignApprovalStatus.SUBMITTED
  );
}

export function canSubmitCampaign(
  user: CampaignPermissionUser,
  campaign: Pick<
    CampaignLifecycleSnapshot,
    "status" | "approvalStatus" | "tenantId"
  >
): boolean {
  return (
    hasCapability(
      user,
      "CAMPAIGN_SUBMIT"
    ) &&
    isSameTenant(
      user,
      campaign.tenantId
    ) &&
    (campaign.status === CommunicationCampaignStatus.DRAFT ||
      campaign.status === CommunicationCampaignStatus.READY) &&
    campaign.approvalStatus !== CommunicationCampaignApprovalStatus.SUBMITTED
  );
}

export function canDeleteCampaign(
  campaign: Pick<
    CampaignLifecycleSnapshot,
    "status" | "approvalStatus" | "attemptedContactCount"
  >
): boolean {
  return (
    campaign.approvalStatus !== CommunicationCampaignApprovalStatus.SUBMITTED &&
    campaign.attemptedContactCount === 0 &&
    campaign.status === CommunicationCampaignStatus.DRAFT
  );
}

export function canArchiveCampaign(
  campaign: Pick<
    CampaignLifecycleSnapshot,
    "status"
  >
): boolean {
  return (
    campaign.status === CommunicationCampaignStatus.COMPLETED ||
    campaign.status === CommunicationCampaignStatus.FAILED ||
    campaign.status === CommunicationCampaignStatus.CANCELLED
  );
}

export function canReviewCampaign(
  user: CampaignPermissionUser,
  campaignTenantId?: string | null
): boolean {
  return (
    hasCapability(
      user,
      "CAMPAIGN_REVIEW"
    ) &&
    isSameTenant(
      user,
      campaignTenantId ?? null
    )
  );
}

export function canApproveCampaign(
  user: CampaignPermissionUser,
  campaign: Pick<
    CampaignLifecycleSnapshot,
    | "approvalStatus"
    | "tenantId"
    | "ownerUserId"
    | "submittedByUserId"
  >
): boolean {
  return (
    canReviewCampaign(
      user,
      campaign.tenantId
    ) &&
    hasCapability(
      user,
      "CAMPAIGN_APPROVE"
    ) &&
    campaign.approvalStatus === CommunicationCampaignApprovalStatus.SUBMITTED &&
    campaign.ownerUserId !== user.id &&
    campaign.submittedByUserId !== user.id
  );
}

export function canRejectCampaign(
  user: CampaignPermissionUser,
  campaign: Pick<
    CampaignLifecycleSnapshot,
    | "approvalStatus"
    | "tenantId"
    | "ownerUserId"
    | "submittedByUserId"
  >
): boolean {
  return (
    canReviewCampaign(
      user,
      campaign.tenantId
    ) &&
    hasCapability(
      user,
      "CAMPAIGN_REJECT"
    ) &&
    campaign.approvalStatus === CommunicationCampaignApprovalStatus.SUBMITTED &&
    campaign.ownerUserId !== user.id &&
    campaign.submittedByUserId !== user.id
  );
}

export function canRequestChangesCampaign(
  user: CampaignPermissionUser,
  campaign: Pick<
    CampaignLifecycleSnapshot,
    "approvalStatus" | "tenantId" | "ownerUserId" | "submittedByUserId"
  >
): boolean {
  return (
    canReviewCampaign(
      user,
      campaign.tenantId
    ) &&
    campaign.approvalStatus === CommunicationCampaignApprovalStatus.SUBMITTED &&
    campaign.ownerUserId !== user.id &&
    campaign.submittedByUserId !== user.id
  );
}

export function canLaunchCampaign(
  user: CampaignPermissionUser,
  campaign: Pick<
    CampaignLifecycleSnapshot,
    | "approvalRequired"
    | "approvalStatus"
    | "approvedByUserId"
    | "approvedRevision"
    | "currentRevision"
    | "ownerUserId"
    | "submittedByUserId"
    | "tenantId"
  >
): boolean {
  if (
    !hasCapability(
      user,
      "CAMPAIGN_LAUNCH"
    )
  ) {
    return false;
  }

  if (
    !isSameTenant(
      user,
      campaign.tenantId
    )
  ) {
    return false;
  }

  if (
    campaign.ownerUserId !== user.id &&
    campaign.submittedByUserId !== user.id
  ) {
    return false;
  }

  if (
    campaign.approvalRequired &&
    campaign.approvedByUserId === user.id
  ) {
    return false;
  }

  if (
    !campaign.approvalRequired
  ) {
    return true;
  }

  return (
    campaign.approvalStatus === CommunicationCampaignApprovalStatus.APPROVED &&
    campaign.approvedRevision === campaign.currentRevision
  );
}

export function canLaunchCampaignState(
  campaign: Pick<
    CampaignLifecycleSnapshot,
    "approvalRequired" | "approvalStatus" | "approvedRevision" | "currentRevision"
  >
): boolean {
  if (!campaign.approvalRequired) {
    return true;
  }

  return (
    campaign.approvalStatus === CommunicationCampaignApprovalStatus.APPROVED &&
    campaign.approvedRevision === campaign.currentRevision
  );
}
