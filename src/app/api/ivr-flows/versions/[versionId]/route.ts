import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import { IVRFlowService } from "@/services/ivr-flow.service";
import { assertIvrFlowOwnership } from "@/services/security/tenant-access.service";

const FLOW_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;

export const GET = asyncHandler(
  async (
    _request: NextRequest,
    {
      params,
    }: {
      params: Promise<{
        versionId: string;
      }>;
    }
  ) => {
    const currentUser = await requireRole(FLOW_ROLES);
    const { versionId } = await params;

    const version = await IVRFlowService.findVersionById(versionId);

    if (!version) {
      throw new Error("IVR flow version not found.");
    }

    await assertIvrFlowOwnership(version.flowId, currentUser);

    return success(version);
  }
);
