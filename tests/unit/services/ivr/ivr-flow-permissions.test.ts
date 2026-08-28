import { IVRFlowLifecycle, UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/lib/app-error";
import { assertIvrFlowPermission, buildIvrFlowPermissions } from "@/services/ivr/ivr-flow-permissions";

const tenantId = "tenant-a";
const maker = { id: "maker", role: UserRole.ADMIN, tenantId, campaignCapabilities: ["CAMPAIGN_CREATE", "CAMPAIGN_EDIT", "CAMPAIGN_SUBMIT", "CAMPAIGN_LAUNCH"] as const };
const checker = { id: "checker", role: UserRole.ADMIN, tenantId, campaignCapabilities: ["CAMPAIGN_REVIEW", "CAMPAIGN_APPROVE", "CAMPAIGN_REJECT", "CAMPAIGN_DELETE", "IVR_PUBLISH"] as const };
const draft = { tenantId, ownerUserId: maker.id, submittedByUserId: null, lifecycle: IVRFlowLifecycle.DRAFT };

describe("IVR flow governance permissions", () => {
  it("allows a maker to create and edit a tenant draft", () => {
    const permissions = buildIvrFlowPermissions(maker, draft);
    expect(permissions.canCreate).toBe(true);
    expect(permissions.canEdit).toBe(true);
  });

  it("does not allow a maker to self-approve a submitted flow", () => {
    expect(buildIvrFlowPermissions(maker, { ...draft, submittedByUserId: maker.id, lifecycle: IVRFlowLifecycle.PENDING_APPROVAL }).canApprove).toBe(false);
  });

  it("allows a separate capable checker to approve and reject", () => {
    const permissions = buildIvrFlowPermissions(checker, { ...draft, submittedByUserId: maker.id, lifecycle: IVRFlowLifecycle.PENDING_APPROVAL });
    expect(permissions.canApprove).toBe(true);
    expect(permissions.canReject).toBe(true);
  });

  it("requires approval and explicit IVR publish capability before publishing", () => {
    const validatedPermissions = buildIvrFlowPermissions(checker, { ...draft, lifecycle: IVRFlowLifecycle.VALIDATED });
    expect(validatedPermissions.canSubmit).toBe(false);
    expect(validatedPermissions.canPublish).toBe(false);
    expect(buildIvrFlowPermissions(maker, { ...draft, lifecycle: IVRFlowLifecycle.VALIDATED }).canSubmit).toBe(true);
    expect(buildIvrFlowPermissions(maker, { ...draft, lifecycle: IVRFlowLifecycle.APPROVED }).canPublish).toBe(false);
    expect(buildIvrFlowPermissions(checker, { ...draft, lifecycle: IVRFlowLifecycle.APPROVED }).canPublish).toBe(true);
  });

  it("maps denied governance actions to a controlled forbidden error", () => {
    expect(() => assertIvrFlowPermission(false, "No publish permission")).toThrow(ForbiddenError);
  });

  it("allows editing a published flow only as the next mutable draft revision", () => {
    expect(buildIvrFlowPermissions(maker, { ...draft, lifecycle: IVRFlowLifecycle.PUBLISHED }).canEdit).toBe(true);
  });

  it("keeps a maker out of release while allowing published-version operations", () => {
    const permissions = buildIvrFlowPermissions(maker, { ...draft, lifecycle: IVRFlowLifecycle.APPROVED });
    expect(permissions.canPublish).toBe(false);
    expect(permissions.canDeploy).toBe(true);
    expect(permissions.canUnapply).toBe(true);
  });

  it("allows an approver to release without making the approver a deployment operator", () => {
    const permissions = buildIvrFlowPermissions(checker, { ...draft, lifecycle: IVRFlowLifecycle.APPROVED });
    expect(permissions.canPublish).toBe(true);
    expect(permissions.canDeploy).toBe(false);
    expect(permissions.canUnapply).toBe(false);
  });

  it("allows a validated disposable flow to be deleted but retains published history", () => {
    expect(buildIvrFlowPermissions(maker, { ...draft, lifecycle: IVRFlowLifecycle.VALIDATED }).canDelete).toBe(true);
    expect(buildIvrFlowPermissions(maker, { ...draft, lifecycle: IVRFlowLifecycle.DRAFT, versions: [{ status: "PUBLISHED" }] }).canDelete).toBe(false);
  });

  it("allows withdrawal only while the flow is pending approval", () => {
    expect(buildIvrFlowPermissions(maker, { ...draft, lifecycle: IVRFlowLifecycle.PENDING_APPROVAL }).canWithdraw).toBe(true);
    expect(buildIvrFlowPermissions(maker, draft).canWithdraw).toBe(false);
  });

  it("does not archive an active deployed flow", () => {
    expect(buildIvrFlowPermissions(maker, { ...draft, lifecycle: IVRFlowLifecycle.PUBLISHED, inboundProfiles: [{ active: true, ivrFlowVersionId: "version-1" }] }).canArchive).toBe(false);
  });

  it("does not let another tenant edit the draft", () => {
    expect(buildIvrFlowPermissions({ ...maker, tenantId: "tenant-b" }, draft).canEdit).toBe(false);
  });

  it("gives SUPER_ADMIN all capabilities while retaining lifecycle and self-approval safety", () => {
    const platform = { id: "platform", role: UserRole.SUPER_ADMIN, tenantId, campaignCapabilities: [] as const };
    expect(buildIvrFlowPermissions(platform, { ...draft, submittedByUserId: maker.id, lifecycle: IVRFlowLifecycle.PENDING_APPROVAL }).canApprove).toBe(true);
    expect(buildIvrFlowPermissions(platform, { ...draft, lifecycle: IVRFlowLifecycle.DRAFT }).canPublish).toBe(false);
    expect(buildIvrFlowPermissions(platform, { ...draft, lifecycle: IVRFlowLifecycle.PUBLISHED, inboundProfiles: [{ active: true, ivrFlowVersionId: "version-1" }] }).canArchive).toBe(false);
  });
});
