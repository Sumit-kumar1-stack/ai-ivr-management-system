import { CommunicationChannel, CommunicationCampaignStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignFindUnique: vi.fn(),
  campaignUpdate: vi.fn(),
  flowFindUnique: vi.fn(),
  versionFindFirst: vi.fn(),
  getRuntimeMenu: vi.fn(),
  materialChange: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communicationCampaign: {
      findUnique: mocks.campaignFindUnique,
      update: mocks.campaignUpdate,
    },
    iVRFlow: {
      findUnique: mocks.flowFindUnique,
    },
    iVRFlowVersion: {
      findFirst: mocks.versionFindFirst,
    },
  },
}));

vi.mock("@/services/ivr-flow.service", () => ({
  IVRFlowService: {
    getRuntimeMenu: mocks.getRuntimeMenu,
    findPublishedVersion: vi.fn(),
  },
}));

vi.mock("@/services/communication/communication-campaign-material-change.service", () => ({
  recordCommunicationCampaignMaterialChange: mocks.materialChange,
}));

import { bindCommunicationIvrFlow } from "@/services/communication/communication-ivr-binding.service";

const actor = {
  id: "maker-a",
  role: UserRole.ADMIN,
  tenantId: "tenant-a",
  campaignCapabilities: ["CAMPAIGN_EDIT"],
} as const;

describe("communication IVR binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaignFindUnique.mockResolvedValue({
      id: "campaign-a",
      status: CommunicationCampaignStatus.DRAFT,
      channels: [CommunicationChannel.IVR],
      ownerUser: { tenantId: "tenant-a" },
    });
    mocks.flowFindUnique.mockResolvedValue({
      id: "flow-a",
      name: "Collection flow",
      description: null,
      version: 2,
      tenantId: "tenant-a",
      isPublished: true,
      nodes: [],
    });
    mocks.getRuntimeMenu.mockReturnValue({ type: "DTMF_MENU", options: [] });
    mocks.versionFindFirst.mockResolvedValue({
      id: "version-2",
      flowId: "flow-a",
      versionNumber: 2,
    });
    mocks.campaignUpdate.mockResolvedValue({});
    mocks.materialChange.mockResolvedValue(undefined);
  });

  it("binds the exact published version and records a material change", async () => {
    const result = await bindCommunicationIvrFlow(
      "campaign-a",
      "flow-a",
      "version-2",
      actor
    );

    expect(result).toMatchObject({
      id: "flow-a",
      version: 2,
      publishedVersionId: "version-2",
    });
    expect(mocks.campaignUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { ivrFlowId: "flow-a", ivrFlowVersionId: "version-2" },
    }));
    expect(mocks.materialChange).toHaveBeenCalledWith("campaign-a", actor);
  });

  it("rejects a cross-tenant flow before campaign mutation", async () => {
    mocks.flowFindUnique.mockResolvedValue({
      id: "flow-b",
      name: "Other tenant flow",
      description: null,
      version: 1,
      tenantId: "tenant-b",
      isPublished: true,
      nodes: [],
    });

    await expect(bindCommunicationIvrFlow(
      "campaign-a",
      "flow-b",
      "version-b",
      actor
    )).rejects.toThrow("Cross-tenant IVR flow binding is not allowed");
    expect(mocks.campaignUpdate).not.toHaveBeenCalled();
    expect(mocks.materialChange).not.toHaveBeenCalled();
  });
});
