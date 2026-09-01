import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CommunicationCampaignApprovalStatus,
  CommunicationCampaignStatus,
  UserRole,
} from "@prisma/client";
import {
  isCampaignSelfApproval,
  canApproveCampaign,
  type CampaignPermissionUser,
  type CampaignLifecycleSnapshot,
} from "@/services/communication/campaign-permissions";
import {
  MAKER_CAPABILITIES,
  CHECKER_CAPABILITIES,
  ORGANIZATION_ADMIN_CAPABILITIES,
} from "@/features/users/user-campaign-capabilities";

describe("Campaign Self-Approval Governance Override", () => {
  const originalEnv = process.env;

  const superAdminUser: CampaignPermissionUser = {
    id: "user-super-admin",
    role: UserRole.SUPER_ADMIN,
    tenantId: "tenant-1",
  };

  const makerUser: CampaignPermissionUser = {
    id: "user-maker",
    role: UserRole.ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: MAKER_CAPABILITIES,
  };

  const checkerUser: CampaignPermissionUser = {
    id: "user-checker",
    role: UserRole.ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: CHECKER_CAPABILITIES,
  };

  const orgAdminUser: CampaignPermissionUser = {
    id: "user-org-admin",
    role: UserRole.ADMIN,
    tenantId: "tenant-1",
    campaignCapabilities: ORGANIZATION_ADMIN_CAPABILITIES,
  };

  const submittedSuperAdminCampaign: CampaignLifecycleSnapshot = {
    status: CommunicationCampaignStatus.READY,
    approvalStatus: CommunicationCampaignApprovalStatus.SUBMITTED,
    approvalRequired: true,
    tenantId: "tenant-1",
    ownerUserId: "user-super-admin",
    submittedByUserId: "user-super-admin",
    approvedByUserId: null,
    currentRevision: 1,
    approvedRevision: null,
    attemptedContactCount: 0,
  };

  const submittedOrgAdminCampaign: CampaignLifecycleSnapshot = {
    status: CommunicationCampaignStatus.READY,
    approvalStatus: CommunicationCampaignApprovalStatus.SUBMITTED,
    approvalRequired: true,
    tenantId: "tenant-1",
    ownerUserId: "user-org-admin",
    submittedByUserId: "user-org-admin",
    approvedByUserId: null,
    currentRevision: 1,
    approvedRevision: null,
    attemptedContactCount: 0,
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
      expect(
        isCampaignSelfApproval(superAdminUser, submittedSuperAdminCampaign)
      ).toBe(true);
      expect(
        canApproveCampaign(superAdminUser, submittedSuperAdminCampaign)
      ).toBe(false);
    });

    it("rejects self-approval for Org Admin", () => {
      expect(
        isCampaignSelfApproval(orgAdminUser, submittedOrgAdminCampaign)
      ).toBe(true);
      expect(
        canApproveCampaign(orgAdminUser, submittedOrgAdminCampaign)
      ).toBe(false);
    });

    it("allows a different Checker to approve the campaign", () => {
      expect(
        canApproveCampaign(checkerUser, submittedSuperAdminCampaign)
      ).toBe(true);
      expect(
        canApproveCampaign(checkerUser, submittedOrgAdminCampaign)
      ).toBe(true);
    });
  });

  describe("when ALLOW_SUPER_ADMIN_SELF_APPROVAL is true in development", () => {
    beforeEach(() => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";
    });

    it("allows SUPER_ADMIN to self-approve own submitted campaign for testing", () => {
      expect(
        isCampaignSelfApproval(superAdminUser, submittedSuperAdminCampaign)
      ).toBe(false);
      expect(
        canApproveCampaign(superAdminUser, submittedSuperAdminCampaign)
      ).toBe(true);
    });

    it("STILL BLOCKS self-approval for Org Admin (override only applies to SUPER_ADMIN)", () => {
      expect(
        isCampaignSelfApproval(orgAdminUser, submittedOrgAdminCampaign)
      ).toBe(true);
      expect(
        canApproveCampaign(orgAdminUser, submittedOrgAdminCampaign)
      ).toBe(false);
    });

    it("STILL BLOCKS self-approval for Maker", () => {
      const makerCampaign: CampaignLifecycleSnapshot = {
        ...submittedSuperAdminCampaign,
        ownerUserId: "user-maker",
        submittedByUserId: "user-maker",
      };
      expect(isCampaignSelfApproval(makerUser, makerCampaign)).toBe(true);
      expect(canApproveCampaign(makerUser, makerCampaign)).toBe(false);
    });

    it("STILL REQUIRES campaign to be in SUBMITTED state to be approved", () => {
      const draftCampaign: CampaignLifecycleSnapshot = {
        ...submittedSuperAdminCampaign,
        approvalStatus: CommunicationCampaignApprovalStatus.DRAFT,
      };
      expect(canApproveCampaign(superAdminUser, draftCampaign)).toBe(false);
    });
  });

  describe("PRODUCTION FAIL-SAFE", () => {
    it("strictly blocks self-approval in production even if flag is true", () => {
      (process.env as any).NODE_ENV = "production";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";

      expect(
        isCampaignSelfApproval(superAdminUser, submittedSuperAdminCampaign)
      ).toBe(true);
      expect(
        canApproveCampaign(superAdminUser, submittedSuperAdminCampaign)
      ).toBe(false);
    });
  });
});
