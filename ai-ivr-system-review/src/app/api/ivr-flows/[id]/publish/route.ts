import {
  UserRole,
} from "@prisma/client";

import {
  success,
} from "@/lib/api-response";

import {
  asyncHandler,
} from "@/lib/async-handler";

import {
  requireRole,
} from "@/lib/auth";

import {
  IVRFlowService,
} from "@/services/ivr-flow.service";

import {
  assertIvrFlowOwnership,
} from "@/services/security/tenant-access.service";

const FLOW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

//--------------------------------------------------
// POST /api/ivr-flows/:id/publish
//--------------------------------------------------

export const POST =
  asyncHandler(
    async (
      _request,
      {
        params,
      }: {
        params:
          Promise<{
            id:
              string;
          }>;
      }
    ) => {
      const currentUser = await requireRole(FLOW_ROLES);

      const {
        id,
      } =
        await params;

      await assertIvrFlowOwnership(
        id,
        currentUser
      );

      const flow =
        await IVRFlowService
          .publish(
            id
          );

      return success(
        flow,
        "IVR flow published successfully"
      );
    }
  );
