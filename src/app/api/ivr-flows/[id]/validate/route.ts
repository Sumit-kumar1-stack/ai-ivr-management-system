import { AuditEventOutcome, UserRole } from "@prisma/client";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";

import { IVRFlowService } from "@/services/ivr-flow.service";
import {
  buildIVRBuilderCatalogForTenant,
  toIVRFlowResourceAuthorization,
} from "@/services/ivr/ivr-builder-catalog.service";
import { assertIvrFlowOwnership } from "@/services/security/tenant-access.service";
import { assertIvrFlowPermission, buildIvrFlowPermissions } from "@/services/ivr/ivr-flow-permissions";
import { recordAuditEvent } from "@/services/audit/audit-event.service";

const FLOW_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;

export const GET = asyncHandler(
  async (
    _request,
    {
      params,
    }: {
      params: Promise<{
        id: string;
      }>;
    }
  ) => {
    const currentUser = await requireRole(FLOW_ROLES);
    const { id } = await params;

    await assertIvrFlowOwnership(id, currentUser);

    const flow = await IVRFlowService.findById(id);

    if (!flow) {
      throw new Error("IVR flow not found.");
    }

    assertIvrFlowPermission(
      buildIvrFlowPermissions(currentUser, flow).canValidate,
      "You do not have permission to validate this IVR flow."
    );

    const catalog = await buildIVRBuilderCatalogForTenant(flow.tenantId ?? "");
    const { validation } = await IVRFlowService.recordValidation(
      id,
      toIVRFlowResourceAuthorization(catalog)
    );

    const validationSummary = {
      valid: validation.valid,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      infoCount: validation.issues.filter(issue => issue.severity === "INFO").length,
      nodeCount: Array.isArray(flow.nodes) ? flow.nodes.length : 0,
      edgeCount: Array.isArray(flow.edges) ? flow.edges.length : 0,
    };

    await recordAuditEvent({
      tenantId: flow.tenantId ?? "",
      actor: currentUser,
      entityType: "IVR_FLOW",
      entityId: id,
      action: "ivr.flow.validated",
      outcome: AuditEventOutcome.SUCCEEDED,
      beforeState: { lifecycle: flow.lifecycle, validationStatus: flow.validationStatus },
      afterState: { validationStatus: validation.valid ? "VALID" : "INVALID" },
    });

    await recordAuditEvent({
      tenantId: flow.tenantId ?? "",
      actor: currentUser,
      entityType: "IVR_FLOW",
      entityId: id,
      action: "ivr.builder.validated",
      outcome: AuditEventOutcome.SUCCEEDED,
      metadata: validationSummary,
    });

    return success(validation);
  }
);
