import {
  UserRole,
} from "@prisma/client";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildCampaignPermissions,
  canCreateCampaign,
} from "@/services/communication/campaign-permissions";
import {
  getDefaultCampaignCapabilitiesForRole,
} from "@/features/users/user-campaign-capabilities";

describe(
  "campaign permissions",
  () => {
    it("gives a creator campaign launch without checker or IVR publication authority", () => {
      const creator = {
        id: "creator-1",
        role: UserRole.ADMIN,
        tenantId: "tenant-1",
        campaignCapabilities: [
          "CAMPAIGN_CREATE",
          "CAMPAIGN_EDIT",
          "CAMPAIGN_SUBMIT",
          "CAMPAIGN_LAUNCH",
        ],
      } as const;

      const permissions = buildCampaignPermissions(creator, {
        status: "DRAFT",
        approvalStatus: "DRAFT",
        approvalRequired: true,
        tenantId: "tenant-1",
        ownerUserId: "creator-1",
        submittedByUserId: null,
        approvedByUserId: null,
        currentRevision: 1,
        approvedRevision: null,
        attemptedContactCount: 0,
      });

      expect(canCreateCampaign(creator)).toBe(true);
      expect(permissions).toMatchObject({
        canEdit: true,
        canSubmit: true,
        canApprove: false,
        canReject: false,
        selfApprovalBlocked: false,
        canLaunch: false,
        canDelete: true,
      });
    });

    it("permits an approver to decide another creator's submission but not launch it", () => {
      const approver = {
        id: "approver-1",
        role: UserRole.ADMIN,
        tenantId: "tenant-1",
        campaignCapabilities: [
          "CAMPAIGN_REVIEW",
          "CAMPAIGN_APPROVE",
          "CAMPAIGN_REJECT",
          "CAMPAIGN_DELETE",
          "IVR_PUBLISH",
        ],
      } as const;

      const permissions = buildCampaignPermissions(approver, {
        status: "DRAFT",
        approvalStatus: "SUBMITTED",
        approvalRequired: true,
        tenantId: "tenant-1",
        ownerUserId: "creator-1",
        submittedByUserId: "creator-1",
        approvedByUserId: null,
        currentRevision: 3,
        approvedRevision: null,
        attemptedContactCount: 0,
      });

      expect(permissions).toMatchObject({
        canEdit: false,
        canSubmit: false,
        canReview: true,
        canApprove: true,
        canReject: true,
        canLaunch: false,
      });

      const approvedPermissions = buildCampaignPermissions(approver, {
        status: "READY",
        approvalStatus: "APPROVED",
        approvalRequired: true,
        tenantId: "tenant-1",
        ownerUserId: "creator-1",
        submittedByUserId: "creator-1",
        approvedByUserId: "approver-1",
        currentRevision: 3,
        approvedRevision: 3,
        attemptedContactCount: 0,
      });

      expect(approvedPermissions.canLaunch).toBe(false);
    });

    it("keeps protected campaigns out of creator deletion and assigns retirement to the approver", () => {
      const creator = { id: "creator-1", role: UserRole.ADMIN, tenantId: "tenant-1", campaignCapabilities: ["CAMPAIGN_EDIT"] } as const;
      const approver = { id: "approver-1", role: UserRole.ADMIN, tenantId: "tenant-1", campaignCapabilities: ["CAMPAIGN_DELETE"] } as const;
      const protectedCampaign = {
        status: "READY" as const,
        approvalStatus: "APPROVED" as const,
        approvalRequired: true,
        tenantId: "tenant-1",
        ownerUserId: "creator-1",
        submittedByUserId: "creator-1",
        approvedByUserId: "approver-1",
        currentRevision: 1,
        approvedRevision: 1,
        attemptedContactCount: 0,
      };

      expect(buildCampaignPermissions(creator, protectedCampaign).canDelete).toBe(false);
      expect(buildCampaignPermissions(approver, { ...protectedCampaign, status: "DRAFT", approvalStatus: "DRAFT", submittedByUserId: null, approvedByUserId: null, approvedRevision: null }).canDelete).toBe(true);
      expect(buildCampaignPermissions(approver, { ...protectedCampaign, status: "COMPLETED" }).canArchive).toBe(true);
    });

    it("gives SUPER_ADMIN capability coverage while retaining lifecycle requirements", () => {
      const platform = { id: "platform", role: UserRole.SUPER_ADMIN, tenantId: "tenant-1", campaignCapabilities: [] } as const;
      const approved = {
        status: "READY" as const,
        approvalStatus: "APPROVED" as const,
        approvalRequired: true,
        tenantId: "tenant-1",
        ownerUserId: "creator-1",
        submittedByUserId: "creator-1",
        approvedByUserId: "platform",
        currentRevision: 2,
        approvedRevision: 2,
        attemptedContactCount: 0,
      };

      expect(buildCampaignPermissions(platform, approved).canLaunch).toBe(true);
      expect(buildCampaignPermissions(platform, { ...approved, approvalStatus: "DRAFT", approvedRevision: null }).canLaunch).toBe(false);
      expect(buildCampaignPermissions(platform, { ...approved, status: "DRAFT", approvalStatus: "DRAFT", approvedRevision: null, attemptedContactCount: 1 }).canDelete).toBe(false);
    });

    it("allows SUPER_ADMIN to review another tenant submission but blocks its own submission", () => {
      const platform = {
        id: "platform",
        role: UserRole.SUPER_ADMIN,
        tenantId: "tenant-a",
        campaignCapabilities: [],
      } as const;

      const otherSubmission = buildCampaignPermissions(platform, {
        status: "DRAFT",
        approvalStatus: "SUBMITTED",
        approvalRequired: true,
        tenantId: "tenant-b",
        ownerUserId: "creator-b",
        submittedByUserId: "creator-b",
        approvedByUserId: null,
        currentRevision: 1,
        approvedRevision: null,
        attemptedContactCount: 0,
      });

      expect(otherSubmission).toMatchObject({
        canReview: true,
        canApprove: true,
        canReject: true,
        selfApprovalBlocked: false,
      });

      const ownSubmission = buildCampaignPermissions(platform, {
        status: "DRAFT",
        approvalStatus: "SUBMITTED",
        approvalRequired: true,
        tenantId: "tenant-a",
        ownerUserId: "platform",
        submittedByUserId: "platform",
        approvedByUserId: null,
        currentRevision: 1,
        approvedRevision: null,
        attemptedContactCount: 0,
      });

      expect(ownSubmission).toMatchObject({
        canReview: true,
        canApprove: false,
        canReject: false,
        selfApprovalBlocked: true,
      });
    });

    it("keeps an approver tenant-scoped", () => {
      const approver = {
        id: "approver-a",
        role: UserRole.ADMIN,
        tenantId: "tenant-a",
        campaignCapabilities: [
          "CAMPAIGN_REVIEW",
          "CAMPAIGN_APPROVE",
          "CAMPAIGN_REJECT",
        ],
      } as const;

      const permissions = buildCampaignPermissions(approver, {
        status: "DRAFT",
        approvalStatus: "SUBMITTED",
        approvalRequired: true,
        tenantId: "tenant-b",
        ownerUserId: "creator-b",
        submittedByUserId: "creator-b",
        approvedByUserId: null,
        currentRevision: 1,
        approvedRevision: null,
        attemptedContactCount: 0,
      });

      expect(permissions).toMatchObject({
        canReview: false,
        canApprove: false,
        canReject: false,
      });
    });

    it("keeps the default maker, checker, and SUPER_ADMIN capability sets separated", () => {
      expect(getDefaultCampaignCapabilitiesForRole(UserRole.ADMIN)).toEqual([
        "CAMPAIGN_CREATE",
        "CAMPAIGN_EDIT",
        "CAMPAIGN_SUBMIT",
        "CAMPAIGN_LAUNCH",
      ]);
      expect(getDefaultCampaignCapabilitiesForRole(UserRole.AGENT)).toEqual([]);
      expect(getDefaultCampaignCapabilitiesForRole(UserRole.SUPER_ADMIN)).toEqual(
        expect.arrayContaining([
          "CAMPAIGN_CREATE",
          "CAMPAIGN_EDIT",
          "CAMPAIGN_SUBMIT",
          "CAMPAIGN_REVIEW",
          "CAMPAIGN_APPROVE",
          "CAMPAIGN_REJECT",
          "CAMPAIGN_LAUNCH",
        ])
      );
    });

    it(
      "returns no mutation permissions for a cross-tenant campaign snapshot",
      () => {
        const permissions =
          buildCampaignPermissions(
            {
              id:
                "user-1",

              role:
                UserRole.ADMIN,

              tenantId:
                "tenant-a",

              campaignCapabilities: [
                "CAMPAIGN_CREATE",
                "CAMPAIGN_EDIT",
                "CAMPAIGN_SUBMIT",
                "CAMPAIGN_LAUNCH",
              ],
            },
            {
              status:
                "DRAFT",

              approvalStatus:
                "DRAFT",

              approvalRequired:
                true,

              tenantId:
                "tenant-b",

              ownerUserId:
                "owner-1",

              submittedByUserId:
                null,

              approvedByUserId:
                null,

              currentRevision:
                1,

              approvedRevision:
                null,

              attemptedContactCount:
                0,
            }
          );

        expect(permissions).toEqual({
          canEdit: false,
          canSubmit: false,
          canReview: false,
          canApprove: false,
          canReject: false,
          canRequestChanges: false,
          selfApprovalBlocked: false,
          canLaunch: false,
          canDelete: false,
          canArchive: false,
        });
      }
    );
  }
);
