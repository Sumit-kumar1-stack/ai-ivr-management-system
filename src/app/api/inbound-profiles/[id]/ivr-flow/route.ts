import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import { bindInboundProfileIvrFlow, unbindInboundProfileIvrFlow } from "@/services/ivr/inbound-profile-ivr-binding.service";
import { assertIvrFlowPermission, canManageIvrDeployment } from "@/services/ivr/ivr-flow-permissions";
import { recordAuditEvent } from "@/services/audit/audit-event.service";

const FLOW_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;

const inputSchema = z.object({
  ivrFlowId: z.string().trim().min(1),
  ivrFlowVersionId: z.string().trim().min(1),
});

export const PUT = asyncHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const currentUser = await requireRole(FLOW_ROLES);
    const { id } = await params;
    const input = inputSchema.parse(await request.json());
    assertIvrFlowPermission(
      canManageIvrDeployment(currentUser, currentUser.tenantId),
      "IVR operations permission is required to bind a production IVR version."
    );
    const binding = await bindInboundProfileIvrFlow({
      inboundProfileId: id,
      ...input,
      actor: currentUser,
    });

    await recordAuditEvent({ tenantId: binding.tenantId, actor: currentUser, entityType: "IVR_FLOW", entityId: binding.ivrFlowId, resourceType: "INBOUND_PROFILE", resourceId: binding.inboundProfileId, action: "ivr.flow.applied", outcome: "SUCCEEDED", metadata: { versionId: binding.ivrFlowVersionId } });
    return success(binding, "Published IVR flow bound to inbound profile");
  }
);

export const DELETE = asyncHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const currentUser = await requireRole(FLOW_ROLES);
    const { id } = await params;
    assertIvrFlowPermission(
      canManageIvrDeployment(currentUser, currentUser.tenantId),
      "IVR operations permission is required to unapply a production IVR version."
    );
    const previousBinding = await unbindInboundProfileIvrFlow({ inboundProfileId: id, actor: currentUser });
    await recordAuditEvent({ tenantId: previousBinding.tenantId, actor: currentUser, entityType: "IVR_FLOW", entityId: previousBinding.ivrFlowId, resourceType: "INBOUND_PROFILE", resourceId: previousBinding.id, action: "ivr.flow.unapplied", outcome: "SUCCEEDED", metadata: { versionId: previousBinding.ivrFlowVersionId } });
    return success(previousBinding, "Published IVR flow unapplied from inbound profile");
  }
);
