import { AuditEventOutcome, IVRFlowVersionStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { success } from "@/lib/api-response";
import { ConflictError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import { recordAuditEvent } from "@/services/audit/audit-event.service";
import { bindInboundProfileIvrFlow } from "@/services/ivr/inbound-profile-ivr-binding.service";
import { assertIvrFlowPermission, buildIvrFlowPermissions } from "@/services/ivr/ivr-flow-permissions";
import { IVRFlowService } from "@/services/ivr-flow.service";
import { assertIvrFlowOwnership } from "@/services/security/tenant-access.service";

const FLOW_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;
const inputSchema = z.object({
  inboundProfileId: z.string().trim().min(1),
  versionId: z.string().trim().min(1),
});

export const POST = asyncHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const currentUser = await requireRole(FLOW_ROLES);
  const { id } = await params;
  const input = inputSchema.parse(await request.json());
  await assertIvrFlowOwnership(id, currentUser);

  const flow = await IVRFlowService.findById(id);
  const version = await IVRFlowService.findVersionById(input.versionId);
  if (!flow || !version || version.flowId !== flow.id || version.status !== IVRFlowVersionStatus.PUBLISHED) {
    throw new ConflictError("Choose an immutable published version before applying it to an inbound profile.", "IVR_VERSION_DEPLOYMENT_BLOCKED");
  }
  assertIvrFlowPermission(
    buildIvrFlowPermissions(currentUser, flow).canDeploy,
    "IVR operations permission is required to apply an IVR version to production."
  );

  const binding = await bindInboundProfileIvrFlow({
    inboundProfileId: input.inboundProfileId,
    ivrFlowId: flow.id,
    ivrFlowVersionId: version.id,
    actor: currentUser,
  });
  await recordAuditEvent({
    tenantId: binding.tenantId,
    actor: currentUser,
    entityType: "IVR_FLOW",
    entityId: flow.id,
    resourceType: "INBOUND_PROFILE",
    resourceId: binding.inboundProfileId,
    action: binding.previousBinding ? "ivr.flow.rebound" : "ivr.flow.applied",
    outcome: AuditEventOutcome.SUCCEEDED,
    metadata: { versionId: version.id, previousBinding: binding.previousBinding },
  });

  return success(binding, binding.previousBinding ? "Published IVR version rebound to inbound profile" : "Published IVR version applied to inbound profile");
});
