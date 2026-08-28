import { NextRequest } from "next/server";
import { z } from "zod";
import { AuditEventOutcome } from "@prisma/client";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireUser } from "@/lib/auth";
import { IVRFlowService } from "@/services/ivr-flow.service";
import { assertIvrFlowOwnership } from "@/services/security/tenant-access.service";
import { assertIvrFlowPermission, buildIvrFlowPermissions } from "@/services/ivr/ivr-flow-permissions";
import { recordAuditEvent } from "@/services/audit/audit-event.service";

const actionSchema = z.object({
  action: z.enum(["submit", "withdraw", "approve", "reject", "archive"]),
  reason: z.string().trim().max(2_000).optional(),
});

export const POST = asyncHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const currentUser = await requireUser();
  const { id } = await params;
  await assertIvrFlowOwnership(id, currentUser);
  const flow = await IVRFlowService.findById(id);
  if (!flow) throw new Error("IVR flow not found.");

  const input = actionSchema.parse(await request.json());
  const permissions = buildIvrFlowPermissions(currentUser, flow);

  if (input.action === "submit") {
    assertIvrFlowPermission(permissions.canSubmit, "A validated draft and submit permission are required.");
    const updated = await IVRFlowService.submitForApproval(id, currentUser.id);
    await recordAuditEvent({ tenantId: flow.tenantId ?? "", actor: currentUser, entityType: "IVR_FLOW", entityId: id, action: "ivr.flow.submitted", outcome: AuditEventOutcome.SUCCEEDED, beforeState: { lifecycle: flow.lifecycle }, afterState: { lifecycle: updated.lifecycle } });
    return success(updated, "IVR flow submitted for approval");
  }
  if (input.action === "withdraw") {
    assertIvrFlowPermission(permissions.canWithdraw, "Only an authorized editor can withdraw a submitted IVR flow.");
    const updated = await IVRFlowService.withdrawSubmission(id, currentUser.id);
    await recordAuditEvent({ tenantId: flow.tenantId ?? "", actor: currentUser, entityType: "IVR_FLOW", entityId: id, action: "ivr.flow.withdrawn", outcome: AuditEventOutcome.SUCCEEDED, beforeState: { lifecycle: flow.lifecycle }, afterState: { lifecycle: updated.lifecycle } });
    return success(updated, "IVR flow submission withdrawn");
  }
  if (input.action === "approve") {
    assertIvrFlowPermission(permissions.canApprove, "You cannot approve this IVR flow. Creators cannot approve their own flow.");
    const updated = await IVRFlowService.approve(id, currentUser.id);
    await recordAuditEvent({ tenantId: flow.tenantId ?? "", actor: currentUser, entityType: "IVR_FLOW", entityId: id, action: "ivr.flow.approved", outcome: AuditEventOutcome.SUCCEEDED, beforeState: { lifecycle: flow.lifecycle }, afterState: { lifecycle: updated.lifecycle } });
    return success(updated, "IVR flow approved");
  }
  if (input.action === "reject") {
    assertIvrFlowPermission(permissions.canReject, "You cannot reject this IVR flow. Creators cannot reject their own flow.");
    const updated = await IVRFlowService.reject(id, currentUser.id, input.reason ?? "");
    await recordAuditEvent({ tenantId: flow.tenantId ?? "", actor: currentUser, entityType: "IVR_FLOW", entityId: id, action: "ivr.flow.rejected", outcome: AuditEventOutcome.SUCCEEDED, reason: input.reason, beforeState: { lifecycle: flow.lifecycle }, afterState: { lifecycle: updated.lifecycle } });
    return success(updated, "IVR flow rejected");
  }

  assertIvrFlowPermission(permissions.canArchive, "You do not have permission to archive this IVR flow.");
  const updated = await IVRFlowService.archive(id);
  await recordAuditEvent({ tenantId: flow.tenantId ?? "", actor: currentUser, entityType: "IVR_FLOW", entityId: id, action: "ivr.flow.archived", outcome: AuditEventOutcome.SUCCEEDED, beforeState: { lifecycle: flow.lifecycle }, afterState: { lifecycle: updated.lifecycle } });
  return success(updated, "IVR flow archived");
});
