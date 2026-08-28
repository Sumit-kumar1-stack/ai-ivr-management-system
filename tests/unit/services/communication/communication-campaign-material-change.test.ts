import {
  CommunicationCampaignApprovalStatus,
  UserRole,
} from "@prisma/client";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      findUnique:
        vi.fn(),

      updateMany:
        vi.fn(),

      transition:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      communicationCampaign: {
        findUnique:
          mocks.findUnique,

        updateMany:
          mocks.updateMany,
      },
    },
  })
);

vi.mock(
  "@/services/communication/communication-campaign-transition.service",
  () => ({
    transitionCommunicationCampaign:
      mocks.transition,
  })
);

import {
  recordCommunicationCampaignMaterialChange,
} from "@/services/communication/communication-campaign-material-change.service";

const actor = {
  id: "user-1",
  role: UserRole.ADMIN,
  campaignCapabilities: [
    "CAMPAIGN_EDIT",
  ],
  tenantId: "tenant-1",
} as const;

describe("communication campaign material changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bumps revision and resets approval for an approved campaign", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "campaign-1",
      approvalStatus:
        CommunicationCampaignApprovalStatus.APPROVED,
    });

    mocks.updateMany.mockResolvedValue({
      count: 1,
    });

    await recordCommunicationCampaignMaterialChange(
      "campaign-1",
      actor
    );

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          currentRevision: {
            increment: 1,
          },
        },
      })
    );
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedTransition: "RESET_TO_DRAFT",
      })
    );
  });

  it("bumps revision without resetting approval for a draft campaign", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "campaign-1",
      approvalStatus:
        CommunicationCampaignApprovalStatus.DRAFT,
    });

    mocks.updateMany.mockResolvedValue({
      count: 1,
    });

    await recordCommunicationCampaignMaterialChange(
      "campaign-1",
      actor
    );

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          currentRevision: {
            increment: 1,
          },
        },
      })
    );
    expect(mocks.transition).not.toHaveBeenCalled();
  });
});
