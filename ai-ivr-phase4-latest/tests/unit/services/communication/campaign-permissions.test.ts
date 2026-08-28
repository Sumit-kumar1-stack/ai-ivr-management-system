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
} from "@/services/communication/campaign-permissions";

describe(
  "campaign permissions",
  () => {
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
          canLaunch: false,
          canDelete: false,
          canArchive: false,
        });
      }
    );
  }
);
