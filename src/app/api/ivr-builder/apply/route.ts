import { IVRFlowVersionStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import { bindCommunicationIvrFlow } from "@/services/communication/communication-ivr-binding.service";
import {
  resolveIVRBuilderContext,
} from "@/services/ivr/ivr-builder-catalog.service";
import { bindInboundProfileIvrFlow } from "@/services/ivr/inbound-profile-ivr-binding.service";
import { IVRFlowService } from "@/services/ivr-flow.service";
import { assertIvrFlowOwnership } from "@/services/security/tenant-access.service";
import { assertIvrFlowPermission, canManageIvrDeployment } from "@/services/ivr/ivr-flow-permissions";

const FLOW_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;

const inputSchema = z.object({
  flowId: z.string().trim().min(1),
  flowVersionId: z.string().trim().min(1),
  campaignId: z.string().trim().min(1).optional().nullable(),
  inboundProfileId: z.string().trim().min(1).optional().nullable(),
  returnTo: z.string().trim().optional().nullable(),
});

export const POST = asyncHandler(async (request: NextRequest) => {
  const currentUser = await requireRole(FLOW_ROLES);
  const input = inputSchema.parse(await request.json());
  const builderContext = await resolveIVRBuilderContext(currentUser, input);

  assertIvrFlowPermission(
    canManageIvrDeployment(currentUser, builderContext.tenantId),
    "IVR operations permission is required to apply an IVR version to a production context."
  );

  if (builderContext.target.kind === "STANDALONE") {
    throw new Error("Choose a campaign or inbound profile before applying a published IVR version");
  }

  await assertIvrFlowOwnership(input.flowId, currentUser);
  const flow = await IVRFlowService.findById(input.flowId);
  const version = await IVRFlowService.findVersionById(input.flowVersionId);

  if (
    !flow ||
    !version ||
    version.flowId !== flow.id ||
    version.status !== IVRFlowVersionStatus.PUBLISHED ||
    version.tenantId !== builderContext.tenantId
  ) {
    throw new Error("Selected IVR flow version is not available for this builder context");
  }

  const binding =
    builderContext.target.kind === "CAMPAIGN"
      ? await bindCommunicationIvrFlow(
          builderContext.target.campaignId ?? "",
          flow.id,
          version.id,
          currentUser
        )
      : await bindInboundProfileIvrFlow({
          inboundProfileId: builderContext.target.inboundProfileId ?? "",
          ivrFlowId: flow.id,
          ivrFlowVersionId: version.id,
          actor: currentUser,
        });

  return success({
    target: builderContext.target,
    binding,
    returnTo: builderContext.target.returnTo,
  }, "Published IVR version applied");
});
