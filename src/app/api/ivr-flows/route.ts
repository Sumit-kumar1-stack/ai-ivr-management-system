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
  resolveIVRBuilderContext,
} from "@/services/ivr/ivr-builder-catalog.service";
import { assertIvrFlowPermission, buildIvrFlowPermissions } from "@/services/ivr/ivr-flow-permissions";
import { recordAuditEvent } from "@/services/audit/audit-event.service";

const FLOW_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.AGENT,
] as const;

const FLOW_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

//--------------------------------------------------
// GET
//--------------------------------------------------

export const GET =
  asyncHandler(
    async request => {
      const currentUser = await requireRole(FLOW_READ_ROLES);
      const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";

      const flows = await IVRFlowService.findAll(
        currentUser.tenantId ?? null,
        includeArchived
      );

      return success(
        flows.map(flow => ({
          ...flow,
          permissions: buildIvrFlowPermissions(currentUser, flow),
        }))
      );
    }
  );

//--------------------------------------------------
// POST
//--------------------------------------------------

export const POST =
  asyncHandler(
    async (
      request:
        NextRequest
    ) => {
      const currentUser = await requireRole(FLOW_WRITE_ROLES);

      assertIvrFlowPermission(
        buildIvrFlowPermissions(currentUser, {
          tenantId: currentUser.tenantId,
          ownerUserId: currentUser.id,
          submittedByUserId: null,
          lifecycle: "DRAFT",
        }).canCreate,
        "You do not have permission to create an IVR flow."
      );

      const body =
        await request.json();

      const builderContext = await resolveIVRBuilderContext(currentUser, {
        campaignId:
          typeof body.context?.campaignId === "string"
            ? body.context.campaignId
            : null,
        inboundProfileId:
          typeof body.context?.inboundProfileId === "string"
            ? body.context.inboundProfileId
            : null,
      });

      const flow =
        await IVRFlowService
          .create({
            name:
              String(
                body.name ??
                  ""
              ),

            description:
              typeof body.description ===
                "string"
                ? body.description
                : undefined,

            campaignId:
              builderContext.target.kind === "CAMPAIGN"
                ? builderContext.target.campaignId ?? undefined
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

            ownerUserId:
              currentUser.id,

            tenantId:
              builderContext.tenantId,

            updatedByUserId: currentUser.id,
          });

      await recordAuditEvent({ tenantId: flow.tenantId ?? "", actor: currentUser, entityType: "IVR_FLOW", entityId: flow.id, action: "ivr.flow.created", outcome: AuditEventOutcome.SUCCEEDED, afterState: { lifecycle: flow.lifecycle, version: flow.version } });

      return success(
        flow,
        "Flow created successfully"
      );
    }
  );
