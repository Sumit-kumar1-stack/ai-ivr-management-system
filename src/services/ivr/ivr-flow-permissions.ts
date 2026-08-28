import { IVRFlowLifecycle, UserRole } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth";
import { ForbiddenError } from "@/lib/app-error";
import { hasCampaignCapability } from "@/services/communication/campaign-capabilities";

type IvrUser = Pick<AuthenticatedUser, "id" | "role" | "tenantId" | "campaignCapabilities">;

export type IvrFlowPermissionSnapshot = {
  tenantId: string | null;
  ownerUserId: string | null;
  submittedByUserId: string | null;
  lifecycle: IVRFlowLifecycle;
  isPublished?: boolean;
  versions?: Array<{ status: string }>;
  inboundProfiles?: Array<{ active: boolean; ivrFlowVersionId?: string | null }>;
};

function isIvrAdministrator(user: IvrUser): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
}

function belongsToTenant(user: IvrUser, flow: Pick<IvrFlowPermissionSnapshot, "tenantId">): boolean {
  return user.role === UserRole.SUPER_ADMIN || Boolean(user.tenantId && flow.tenantId === user.tenantId);
}

function has(user: IvrUser, capability: Parameters<typeof hasCampaignCapability>[1]): boolean {
  return isIvrAdministrator(user) && (user.role === UserRole.SUPER_ADMIN || hasCampaignCapability(user.campaignCapabilities, capability));
}

export function buildIvrFlowPermissions(user: IvrUser, flow: IvrFlowPermissionSnapshot) {
  const sameTenant = belongsToTenant(user, flow);
  // Editing a published flow creates the next mutable draft revision on the
  // flow record; the published IVRFlowVersion remains immutable.
  const editable = flow.lifecycle === IVRFlowLifecycle.DRAFT || flow.lifecycle === IVRFlowLifecycle.VALIDATED || flow.lifecycle === IVRFlowLifecycle.REJECTED || flow.lifecycle === IVRFlowLifecycle.PUBLISHED;
  const isCreator = flow.ownerUserId === user.id || flow.submittedByUserId === user.id;
  const hasPublishedHistory = Boolean(flow.isPublished) || Boolean(flow.versions?.some(version => version.status === "PUBLISHED"));
  const hasActiveDeployment = Boolean(flow.inboundProfiles?.some(profile => profile.active && profile.ivrFlowVersionId));

  return {
    canCreate: has(user, "CAMPAIGN_CREATE"),
    canEdit: sameTenant && editable && has(user, "CAMPAIGN_EDIT"),
    canValidate: sameTenant && editable && has(user, "CAMPAIGN_EDIT"),
    canSimulate: sameTenant && isIvrAdministrator(user),
    canSubmit: sameTenant && (flow.lifecycle === IVRFlowLifecycle.VALIDATED || flow.lifecycle === IVRFlowLifecycle.REJECTED) && has(user, "CAMPAIGN_SUBMIT"),
    canWithdraw: sameTenant && flow.lifecycle === IVRFlowLifecycle.PENDING_APPROVAL && has(user, "CAMPAIGN_EDIT"),
    canApprove: sameTenant && flow.lifecycle === IVRFlowLifecycle.PENDING_APPROVAL && !isCreator && has(user, "CAMPAIGN_REVIEW") && has(user, "CAMPAIGN_APPROVE"),
    canReject: sameTenant && flow.lifecycle === IVRFlowLifecycle.PENDING_APPROVAL && !isCreator && has(user, "CAMPAIGN_REVIEW") && has(user, "CAMPAIGN_REJECT"),
    canPublish: sameTenant && flow.lifecycle === IVRFlowLifecycle.APPROVED && has(user, "IVR_PUBLISH"),
    // Deployment is deliberately capability-based and independent from the
    // mutable draft lifecycle: an existing published v1 can remain deployed
    // while its flow record holds a new draft v2.
    canDeploy: sameTenant && has(user, "CAMPAIGN_EDIT"),
    canUnapply: sameTenant && has(user, "CAMPAIGN_EDIT"),
    canArchive: sameTenant && !hasActiveDeployment && (flow.lifecycle === IVRFlowLifecycle.APPROVED || flow.lifecycle === IVRFlowLifecycle.REJECTED || flow.lifecycle === IVRFlowLifecycle.PUBLISHED) && has(user, "CAMPAIGN_EDIT"),
    canDelete: sameTenant && !hasPublishedHistory && !hasActiveDeployment && (flow.lifecycle === IVRFlowLifecycle.DRAFT || flow.lifecycle === IVRFlowLifecycle.VALIDATED) && has(user, "CAMPAIGN_EDIT"),
  };
}

export function canManageIvrDeployment(
  user: IvrUser,
  tenantId: string | null | undefined
): boolean {
  return belongsToTenant(user, { tenantId: tenantId ?? null }) && has(user, "CAMPAIGN_EDIT");
}

export function assertIvrFlowPermission(
  allowed: boolean,
  message = "You do not have permission to perform this IVR flow action"
): void {
  if (!allowed) throw new ForbiddenError(message);
}
