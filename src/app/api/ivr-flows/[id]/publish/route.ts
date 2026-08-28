import {
  IVRFlowLifecycle,
  IVRFlowValidationStatus,
  AuditEventOutcome,
  UserRole,
} from "@prisma/client";

import {
  success,
} from "@/lib/api-response";
import { ConflictError } from "@/lib/app-error";

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
  buildIVRBuilderCatalogForTenant,
  toIVRFlowResourceAuthorization,
} from "@/services/ivr/ivr-builder-catalog.service";

import {
  assertIvrFlowOwnership,
} from "@/services/security/tenant-access.service";
import { assertIvrFlowPermission, buildIvrFlowPermissions } from "@/services/ivr/ivr-flow-permissions";
import { recordAuditEvent } from "@/services/audit/audit-event.service";

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

      const draft = await IVRFlowService.findById(id);
      if (!draft) {
        throw new Error("IVR flow not found.");
      }

      // A valid but unapproved draft is a governance-state conflict, rather
      // than an unexpected route failure. Keep the approval gate intact.
      if (
        draft.lifecycle !== IVRFlowLifecycle.APPROVED ||
        draft.validationStatus !== IVRFlowValidationStatus.VALID
      ) {
        throw new ConflictError(
          "This IVR flow must be approved and valid before it can be published.",
          "IVR_FLOW_NOT_APPROVED"
        );
      }

      assertIvrFlowPermission(
        buildIvrFlowPermissions(currentUser, draft).canPublish,
        "An approved, valid IVR flow and publish permission are required."
      );

      const catalog = await buildIVRBuilderCatalogForTenant(
        draft.tenantId ?? ""
      );

      const flow =
        await IVRFlowService
          .publish(
            id,
            toIVRFlowResourceAuthorization(catalog),
            currentUser.id
          );

      await recordAuditEvent({ tenantId: draft.tenantId ?? "", actor: currentUser, entityType: "IVR_FLOW", entityId: flow.id, action: "ivr.flow.published", outcome: AuditEventOutcome.SUCCEEDED, beforeState: { lifecycle: draft.lifecycle }, afterState: { lifecycle: flow.lifecycle }, metadata: { versionId: flow.publishedVersion.id } });

      return success(
        flow,
        "IVR flow published successfully"
      );
    }
  );
