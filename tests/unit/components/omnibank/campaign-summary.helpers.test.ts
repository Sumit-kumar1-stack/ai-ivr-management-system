import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildCampaignReadinessItems,
  getCampaignActionEmptyStateCopy,
  getCampaignLaunchBlockers,
  getCampaignReviewStateLabel,
} from "@/components/omnibank/campaign-summary.helpers";

describe("campaign summary helpers", () => {
  it("marks AI Voice objective and opening message as missing when blank", () => {
    const readinessItems = buildCampaignReadinessItems({
      campaign: {
        recipientCount: 12,
        channels: ["AI_VOICE"],
        approvalStatus: "SUBMITTED",
        approvalRequired: true,
        launchImmediately: true,
        scheduledAt: null,
        ivrFlowId: null,
      },
      campaignDescription: "",
      campaignPrompt: "",
      selectedKnowledgeDocumentIds: [],
      knowledgeDocuments: [],
      campaignActionsLength: 0,
    });

    const objective = readinessItems.find(item => item.key === "objective");
    const opening = readinessItems.find(item => item.key === "opening");
    const approval = readinessItems.find(item => item.key === "approval");

    expect(objective?.state).toBe("MISSING");
    expect(opening?.state).toBe("MISSING");
    expect(approval?.state).toBe("MISSING");
    expect(getCampaignLaunchBlockers({
      campaign: {
        recipientCount: 12,
        channels: ["AI_VOICE"],
        approvalStatus: "SUBMITTED",
        approvalRequired: true,
        launchImmediately: true,
        scheduledAt: null,
        ivrFlowId: null,
      },
      campaignDescription: "",
      campaignPrompt: "",
      selectedKnowledgeDocumentIds: [],
      knowledgeDocuments: [],
      campaignActionsLength: 0,
    })).toEqual(
      expect.arrayContaining([
        "Campaign approval is pending.",
        "Campaign objective is required for AI Voice campaigns.",
        "Opening message/instructions are required for AI Voice campaigns.",
      ])
    );
  });

  it("treats approved campaigns as launch-ready when other requirements are satisfied", () => {
    const launchBlockers = getCampaignLaunchBlockers({
      campaign: {
        recipientCount: 20,
        channels: ["AI_VOICE"],
        approvalStatus: "APPROVED",
        approvalRequired: true,
        launchImmediately: true,
        scheduledAt: null,
        ivrFlowId: null,
      },
      campaignDescription: "Outbound call objective",
      campaignPrompt: "Open with a friendly greeting.",
      selectedKnowledgeDocumentIds: ["doc-1"],
      knowledgeDocuments: [
        {
          id: "doc-1",
          status: "ACTIVE",
          chunkCount: 2,
          isIndexed: true,
          campaignCount: 1,
        },
      ],
      campaignActionsLength: 0,
    });

    const approval =
      buildCampaignReadinessItems({
        campaign: {
          recipientCount: 20,
          channels: ["AI_VOICE"],
          approvalStatus: "APPROVED",
          approvalRequired: true,
          launchImmediately: true,
          scheduledAt: null,
          ivrFlowId: null,
        },
        campaignDescription: "Outbound call objective",
        campaignPrompt: "Open with a friendly greeting.",
        selectedKnowledgeDocumentIds: ["doc-1"],
        knowledgeDocuments: [
          {
            id: "doc-1",
            status: "ACTIVE",
            chunkCount: 2,
            isIndexed: true,
            campaignCount: 1,
          },
        ],
        campaignActionsLength: 0,
      }).find(item => item.key === "approval");

    expect(launchBlockers).toEqual([]);
    expect(approval?.state).toBe("READY");
    expect(getCampaignReviewStateLabel("SUBMITTED")).toBe("Pending approval");
    expect(getCampaignReviewStateLabel("APPROVED")).toBe("Approved");
  });

  it("returns the requested action empty-state copy", () => {
    const copy = getCampaignActionEmptyStateCopy();

    expect(copy.title).toBe("No campaign actions configured yet.");
    expect(copy.description).toContain("creating a lead");
    expect(copy.examples).toEqual([
      "CREATE_LEAD",
      "REQUEST_CALLBACK",
      "REQUEST_HUMAN",
    ]);
  });
});
