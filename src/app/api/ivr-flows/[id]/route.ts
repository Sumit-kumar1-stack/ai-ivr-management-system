import {
  UserRole,
  AuditEventOutcome,
} from "@prisma/client";

import {
  NextRequest,
} from "next/server";

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
import { assertIvrFlowPermission, buildIvrFlowPermissions } from "@/services/ivr/ivr-flow-permissions";
import { ConflictError } from "@/lib/app-error";
import { recordAuditEvent } from "@/services/audit/audit-event.service";

const FLOW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

//--------------------------------------------------
// GET
//--------------------------------------------------

export const GET =
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
          .findById(
            id
          );

      return success(flow ? {
        ...flow,
        permissions: buildIvrFlowPermissions(currentUser, flow),
      } : null);
    }
  );

//--------------------------------------------------
// PUT
//--------------------------------------------------

export const PUT =
  asyncHandler(
    async (
      request:
        NextRequest,

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

      const body =
        await request.json();

      await assertIvrFlowOwnership(
        id,
        currentUser
      );

      const existing = await IVRFlowService.findById(id);
      if (!existing) throw new Error("IVR flow not found.");
      assertIvrFlowPermission(
        buildIvrFlowPermissions(currentUser, existing).canEdit,
        "This IVR flow is not editable in its current state or you lack edit permission."
      );

      const flow =
        await IVRFlowService
          .update(
            id,
            {
              name:
                typeof body.name ===
                  "string"
                  ? body.name
                  : undefined,

              description:
                body.description ===
                  null ||
                typeof body.description ===
                  "string"
                  ? body.description
                  : undefined,

              nodes:
                Array.isArray(
                  body.nodes
                )
                  ? body.nodes
                  : [],

              edges:
                Array.isArray(
                  body.edges
                )
                  ? body.edges
                  : [],

              updatedByUserId: currentUser.id,
            }
          );

      await recordAuditEvent({ tenantId: existing.tenantId ?? "", actor: currentUser, entityType: "IVR_FLOW", entityId: id, action: "ivr.flow.updated", outcome: AuditEventOutcome.SUCCEEDED, beforeState: { lifecycle: existing.lifecycle, version: existing.version }, afterState: { lifecycle: flow.lifecycle, version: flow.version } });

      return success(
        flow,
        "Flow updated successfully"
      );
    }
  );

//--------------------------------------------------
// DELETE
//--------------------------------------------------

export const DELETE =
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

      const existing = await IVRFlowService.findById(id);
      if (!existing) throw new Error("IVR flow not found.");
      if (!["DRAFT", "VALIDATED"].includes(existing.lifecycle)) {
        throw new ConflictError("Only a disposable draft or validated IVR flow can be deleted.", "IVR_FLOW_DELETE_LIFECYCLE_BLOCKED");
      }
      assertIvrFlowPermission(
        buildIvrFlowPermissions(currentUser, existing).canDelete,
        "Only unreferenced draft IVR flows can be deleted. Archive published or applied flows instead."
      );

      await IVRFlowService
        .delete(
          id
        );

      await recordAuditEvent({ tenantId: existing.tenantId ?? "", actor: currentUser, entityType: "IVR_FLOW", entityId: id, action: "ivr.flow.deleted", outcome: AuditEventOutcome.SUCCEEDED, beforeState: { lifecycle: existing.lifecycle, version: existing.version } });

      return success(
        null,
        "Flow deleted"
      );
    }
  );
