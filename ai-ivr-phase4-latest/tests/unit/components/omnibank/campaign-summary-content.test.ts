import React from "react";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  renderToStaticMarkup,
} from "react-dom/server";

import {
  CampaignSummaryEditableFields,
  buildCampaignSummarySavePayload,
  getCampaignSummaryEditorValues,
  requestCommunicationCampaignLaunch,
} from "@/components/omnibank/campaign-summary-screen";
import {
  buildCampaignReadinessItems,
  getCampaignLaunchBlockers,
} from "@/components/omnibank/campaign-summary.helpers";
import type {
  CommunicationCampaignDTO,
} from "@/types/communication-campaign";

describe("campaign summary editable content", () => {
  const campaign = {
    description: "Improve renewal conversion",
    prompt: "Welcome back and explain the offer.",
  } as Pick<CommunicationCampaignDTO, "description" | "prompt">;

  function renderEditableFields() {
    return renderToStaticMarkup(
      React.createElement(CampaignSummaryEditableFields, {
        objective: "Improve renewal conversion",
        openingMessage: "Welcome back and explain the offer.",
        onObjectiveChange: () => {},
        onOpeningMessageChange: () => {},
      })
    );
  }

  it("renders the objective textarea", () => {
    const markup = renderEditableFields();

    expect(markup).toContain("Campaign Objective");
    expect(markup).toContain('id="campaign-objective"');
    expect(markup).toContain("Improve renewal conversion");
  });

  it("renders the opening message textarea", () => {
    const markup = renderEditableFields();

    expect(markup).toContain("Opening Message / Instructions");
    expect(markup).toContain('id="campaign-opening-message"');
    expect(markup).toContain("Welcome back and explain the offer.");
  });

  it("uses persisted campaign values as defaults after refetch", () => {
    expect(
      getCampaignSummaryEditorValues(campaign)
    ).toEqual({
      campaignObjective:
        "Improve renewal conversion",
      openingMessage:
        "Welcome back and explain the offer.",
    });
  });

  it("includes edited objective and opening message in the save payload", () => {
    expect(
      buildCampaignSummarySavePayload({
        campaignObjective:
          "Call recent customers about renewal",
        openingMessage:
          "Say hello and explain the renewal offer.",
        launchImmediately: true,
        scheduledLocal: "",
        submitForApproval: false,
      })
    ).toMatchObject({
      description:
        "Call recent customers about renewal",
      prompt:
        "Say hello and explain the renewal offer.",
      launchImmediately: true,
      scheduledAt: null,
    });
  });

  it("launches directly without issuing a save request first", async () => {
    const originalFetch =
      globalThis.fetch;

    const fetchMock =
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            communicationCampaignId:
              "campaign-1",
            status:
              "READY",
            scheduled:
              false,
            scheduledAt:
              null,
            recipientCount:
              12,
          },
        }),
      });

    (globalThis as typeof globalThis & {
      fetch: typeof fetchMock;
    }).fetch =
      fetchMock;

    try {
      await requestCommunicationCampaignLaunch(
        "campaign-1"
      );
    } finally {
      (globalThis as typeof globalThis & {
        fetch: typeof originalFetch;
      }).fetch =
        originalFetch;
    }

    expect(fetchMock).toHaveBeenCalledTimes(
      1
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/communication/campaigns/campaign-1/launch",
      {
        method: "POST",
      }
    );
  });

  it("removes AI Voice readiness blockers when both fields are populated", () => {
    const blockers = getCampaignLaunchBlockers({
      campaign: {
        recipientCount: 10,
        channels: ["AI_VOICE"],
        approvalStatus: "APPROVED",
        approvalRequired: true,
        launchImmediately: true,
        scheduledAt: null,
        ivrFlowId: null,
      },
      campaignDescription:
        "Call recent customers about renewal",
      campaignPrompt:
        "Say hello and explain the renewal offer.",
      selectedKnowledgeDocumentIds: ["doc-1"],
      knowledgeDocuments: [
        {
          id: "doc-1",
          status: "ACTIVE",
          chunkCount: 3,
          isIndexed: true,
          campaignCount: 1,
        },
      ],
      campaignActionsLength: 0,
    });

    const readinessItems = buildCampaignReadinessItems({
      campaign: {
        recipientCount: 10,
        channels: ["AI_VOICE"],
        approvalStatus: "APPROVED",
        approvalRequired: true,
        launchImmediately: true,
        scheduledAt: null,
        ivrFlowId: null,
      },
      campaignDescription:
        "Call recent customers about renewal",
      campaignPrompt:
        "Say hello and explain the renewal offer.",
      selectedKnowledgeDocumentIds: ["doc-1"],
      knowledgeDocuments: [
        {
          id: "doc-1",
          status: "ACTIVE",
          chunkCount: 3,
          isIndexed: true,
          campaignCount: 1,
        },
      ],
      campaignActionsLength: 0,
    });

    expect(blockers).not.toContain(
      "Campaign objective is required for AI Voice campaigns."
    );
    expect(blockers).not.toContain(
      "Opening message/instructions are required for AI Voice campaigns."
    );
    expect(
      readinessItems.find(item => item.key === "objective")?.state
    ).toBe("READY");
    expect(
      readinessItems.find(item => item.key === "opening")?.state
    ).toBe("READY");
  });

  it("keeps the approval blocker intact", () => {
    const blockers = getCampaignLaunchBlockers({
      campaign: {
        recipientCount: 10,
        channels: ["AI_VOICE"],
        approvalStatus: "SUBMITTED",
        approvalRequired: true,
        launchImmediately: true,
        scheduledAt: null,
        ivrFlowId: null,
      },
      campaignDescription:
        "Call recent customers about renewal",
      campaignPrompt:
        "Say hello and explain the renewal offer.",
      selectedKnowledgeDocumentIds: ["doc-1"],
      knowledgeDocuments: [
        {
          id: "doc-1",
          status: "ACTIVE",
          chunkCount: 3,
          isIndexed: true,
          campaignCount: 1,
        },
      ],
      campaignActionsLength: 0,
    });

    expect(blockers).toContain(
      "Campaign approval is pending."
    );
  });
});
