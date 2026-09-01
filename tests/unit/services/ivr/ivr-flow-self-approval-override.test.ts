import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IVRFlowLifecycle, UserRole } from "@prisma/client";
import {
  buildIvrFlowPermissions,
  type IvrFlowPermissionSnapshot,
} from "@/services/ivr/ivr-flow-permissions";
import {
  MAKER_CAPABILITIES,
  CHECKER_CAPABILITIES,
  ORGANIZATION_ADMIN_CAPABILITIES,
} from "@/features/users/user-campaign-capabilities";

describe("IVR Flow Self-Approval Governance Override", () => {
  const originalEnv = process.env;

  const superAdminUser = {
    id: "user-super-admin",
    role: UserRole.SUPER_ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: [],
  };

  const makerUser = {
    id: "user-maker",
    role: UserRole.ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: MAKER_CAPABILITIES,
  };

  const checkerUser = {
    id: "user-checker",
    role: UserRole.ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: CHECKER_CAPABILITIES,
  };

  const orgAdminUser = {
    id: "user-org-admin",
    role: UserRole.ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: ORGANIZATION_ADMIN_CAPABILITIES,
  };

  const pendingSuperAdminFlow: IvrFlowPermissionSnapshot = {
    tenantId: "tenant-1",
    ownerUserId: "user-super-admin",
    submittedByUserId: "user-super-admin",
    lifecycle: IVRFlowLifecycle.PENDING_APPROVAL,
  };

  const pendingOrgAdminFlow: IvrFlowPermissionSnapshot = {
    tenantId: "tenant-1",
    ownerUserId: "user-org-admin",
    submittedByUserId: "user-org-admin",
    lifecycle: IVRFlowLifecycle.PENDING_APPROVAL,
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("when ALLOW_SUPER_ADMIN_SELF_APPROVAL is false (Default / Production)", () => {
    beforeEach(() => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "false";
    });

    it("rejects self-approval for SUPER_ADMIN when flag is false", () => {
      const perms = buildIvrFlowPermissions(superAdminUser, pendingSuperAdminFlow);
      expect(perms.canApprove).toBe(false);
      expect(perms.canReject).toBe(false);
    });

    it("rejects self-approval for Org Admin", () => {
      const perms = buildIvrFlowPermissions(orgAdminUser, pendingOrgAdminFlow);
      expect(perms.canApprove).toBe(false);
      expect(perms.canReject).toBe(false);
    });

    it("allows a different Checker to approve the IVR flow", () => {
      const perms = buildIvrFlowPermissions(checkerUser, pendingSuperAdminFlow);
      expect(perms.canApprove).toBe(true);
      expect(perms.canReject).toBe(true);
    });
  });

  describe("when ALLOW_SUPER_ADMIN_SELF_APPROVAL is true in development", () => {
    beforeEach(() => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";
    });

    it("allows SUPER_ADMIN to self-approve and self-reject own IVR flow for testing", () => {
      const perms = buildIvrFlowPermissions(superAdminUser, pendingSuperAdminFlow);
      expect(perms.canApprove).toBe(true);
      expect(perms.canReject).toBe(true);
    });

    it("STILL BLOCKS self-approval for Org Admin (override only applies to SUPER_ADMIN)", () => {
      const perms = buildIvrFlowPermissions(orgAdminUser, pendingOrgAdminFlow);
      expect(perms.canApprove).toBe(false);
      expect(perms.canReject).toBe(false);
    });

    it("STILL BLOCKS approval for Maker (lack of review/approve capabilities)", () => {
      const perms = buildIvrFlowPermissions(makerUser, pendingSuperAdminFlow);
      expect(perms.canApprove).toBe(false);
    });

    it("STILL REQUIRES lifecycle to be PENDING_APPROVAL", () => {
      const draftFlow: IvrFlowPermissionSnapshot = {
        ...pendingSuperAdminFlow,
        lifecycle: IVRFlowLifecycle.DRAFT,
      };
      const perms = buildIvrFlowPermissions(superAdminUser, draftFlow);
      expect(perms.canApprove).toBe(false);
    });
  });

  describe("PRODUCTION FAIL-SAFE", () => {
    it("strictly blocks self-approval in production even if flag is true", () => {
      (process.env as any).NODE_ENV = "production";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";

      const perms = buildIvrFlowPermissions(superAdminUser, pendingSuperAdminFlow);
      expect(perms.canApprove).toBe(false);
      expect(perms.canReject).toBe(false);
    });
  });
});
