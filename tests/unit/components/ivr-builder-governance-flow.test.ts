import { describe, it, expect } from "vitest";
import { IVRFlowLifecycle, UserRole } from "@prisma/client";
import { buildIvrFlowPermissions, type IvrFlowPermissionSnapshot } from "@/services/ivr/ivr-flow-permissions";
import {
  MAKER_CAPABILITIES,
  CHECKER_CAPABILITIES,
  DEVELOPER_CAPABILITIES,
  ORGANIZATION_ADMIN_CAPABILITIES,
} from "@/features/users/user-campaign-capabilities";

describe("IVR Builder Governance & Submit Visibility State Machine", () => {
  const makerUser = {
    id: "user-maker-1",
    role: UserRole.ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: MAKER_CAPABILITIES,
  };

  const checkerUser = {
    id: "user-checker-1",
    role: UserRole.ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: CHECKER_CAPABILITIES,
  };

  const orgAdminUser = {
    id: "user-admin-1",
    role: UserRole.ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: ORGANIZATION_ADMIN_CAPABILITIES,
  };

  const superAdminUser = {
    id: "user-super-1",
    role: UserRole.SUPER_ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: [],
  };

  function deriveSubmitVisibility(params: {
    selectedFlow?: string;
    isDirty: boolean;
    saveState: "UNSAVED" | "SAVING" | "SAVED" | "FAILED";
    lifecycle?: IVRFlowLifecycle;
    validationStatus?: string;
    canSubmitPermission?: boolean;
  }): boolean {
    const isClean = !params.isDirty && params.saveState === "SAVED";
    const isValidated = params.lifecycle === IVRFlowLifecycle.VALIDATED && params.validationStatus === "VALID";
    return Boolean(
      params.selectedFlow &&
      isClean &&
      isValidated &&
      params.canSubmitPermission
    );
  }

  it("SCENARIO A: New unsaved draft hides Submit and requires save", () => {
    const isVisible = deriveSubmitVisibility({
      selectedFlow: undefined,
      isDirty: true,
      saveState: "UNSAVED",
      lifecycle: undefined,
      validationStatus: undefined,
      canSubmitPermission: false,
    });

    expect(isVisible).toBe(false);
  });

  it("SCENARIO B: Saved & Validated draft shows Submit for user with CAMPAIGN_SUBMIT", () => {
    const flowSnapshot: IvrFlowPermissionSnapshot = {
      tenantId: "tenant-1",
      ownerUserId: "user-maker-1",
      submittedByUserId: null,
      lifecycle: IVRFlowLifecycle.VALIDATED,
    };
    const perms = buildIvrFlowPermissions(makerUser, flowSnapshot);

    const isVisible = deriveSubmitVisibility({
      selectedFlow: "flow-123",
      isDirty: false,
      saveState: "SAVED",
      lifecycle: IVRFlowLifecycle.VALIDATED,
      validationStatus: "VALID",
      canSubmitPermission: perms.canSubmit,
    });

    expect(perms.canSubmit).toBe(true);
    expect(isVisible).toBe(true);
  });

  it("SCENARIO C: Validation failure (INVALID) keeps Submit button hidden", () => {
    const flowSnapshot: IvrFlowPermissionSnapshot = {
      tenantId: "tenant-1",
      ownerUserId: "user-maker-1",
      submittedByUserId: null,
      lifecycle: IVRFlowLifecycle.DRAFT,
    };
    const perms = buildIvrFlowPermissions(makerUser, flowSnapshot);

    const isVisible = deriveSubmitVisibility({
      selectedFlow: "flow-123",
      isDirty: false,
      saveState: "SAVED",
      lifecycle: IVRFlowLifecycle.DRAFT,
      validationStatus: "INVALID",
      canSubmitPermission: perms.canSubmit,
    });

    expect(isVisible).toBe(false);
  });

  it("SCENARIO D: Modifying a VALIDATED flow makes it dirty and immediately hides Submit", () => {
    const isVisible = deriveSubmitVisibility({
      selectedFlow: "flow-123",
      isDirty: true, // User moved a node or edited text
      saveState: "UNSAVED",
      lifecycle: IVRFlowLifecycle.VALIDATED,
      validationStatus: "VALID",
      canSubmitPermission: true,
    });

    expect(isVisible).toBe(false);
  });

  it("SCENARIO E: Reloading a persisted VALIDATED flow restores Submit visibility", () => {
    const flowSnapshot: IvrFlowPermissionSnapshot = {
      tenantId: "tenant-1",
      ownerUserId: "user-maker-1",
      submittedByUserId: null,
      lifecycle: IVRFlowLifecycle.VALIDATED,
    };
    const perms = buildIvrFlowPermissions(makerUser, flowSnapshot);

    const isVisible = deriveSubmitVisibility({
      selectedFlow: "flow-123",
      isDirty: false,
      saveState: "SAVED",
      lifecycle: IVRFlowLifecycle.VALIDATED,
      validationStatus: "VALID",
      canSubmitPermission: perms.canSubmit,
    });

    expect(isVisible).toBe(true);
  });

  it("SCENARIO F: After successful submit, lifecycle is PENDING_APPROVAL and Submit disappears", () => {
    const flowSnapshot: IvrFlowPermissionSnapshot = {
      tenantId: "tenant-1",
      ownerUserId: "user-maker-1",
      submittedByUserId: "user-maker-1",
      lifecycle: IVRFlowLifecycle.PENDING_APPROVAL,
    };
    const perms = buildIvrFlowPermissions(makerUser, flowSnapshot);

    const isVisible = deriveSubmitVisibility({
      selectedFlow: "flow-123",
      isDirty: false,
      saveState: "SAVED",
      lifecycle: IVRFlowLifecycle.PENDING_APPROVAL,
      validationStatus: "VALID",
      canSubmitPermission: perms.canSubmit,
    });

    expect(perms.canSubmit).toBe(false);
    expect(isVisible).toBe(false);
  });

  it("SCENARIO G: User without CAMPAIGN_SUBMIT (e.g. Developer or Checker without submit) never sees Submit", () => {
    const developerUser = {
      id: "user-dev-1",
      role: UserRole.ADMIN,
      tenantId: "tenant-1",
      campaignCapabilities: DEVELOPER_CAPABILITIES,
    };

    const flowSnapshot: IvrFlowPermissionSnapshot = {
      tenantId: "tenant-1",
      ownerUserId: "user-maker-1",
      submittedByUserId: null,
      lifecycle: IVRFlowLifecycle.VALIDATED,
    };
    const perms = buildIvrFlowPermissions(developerUser, flowSnapshot);

    const isVisible = deriveSubmitVisibility({
      selectedFlow: "flow-123",
      isDirty: false,
      saveState: "SAVED",
      lifecycle: IVRFlowLifecycle.VALIDATED,
      validationStatus: "VALID",
      canSubmitPermission: perms.canSubmit,
    });

    expect(perms.canSubmit).toBe(false);
    expect(isVisible).toBe(false);
  });
});
