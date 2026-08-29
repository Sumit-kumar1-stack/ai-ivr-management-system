import { describe, expect, it } from "vitest";

import { getPendingCampaignApprovals } from "@/app/(dashboard)/approvals/approval-queue";
import type {
  CommunicationCampaignDTO,
  CommunicationCampaignPermissions,
} from "@/types/communication-campaign";

function permissions(
  overrides: Partial<CommunicationCampaignPermissions> = {}
): CommunicationCampaignPermissions {
  return {
    canEdit: false,
    canSubmit: false,
    canReview: true,
    canApprove: true,
    canReject: true,
    canRequestChanges: true,
    selfApprovalBlocked: false,
    canLaunch: false,
    canDelete: false,
    canArchive: false,
    ...overrides,
  };
}

function campaign(
  approvalStatus: CommunicationCampaignDTO["approvalStatus"],
  campaignPermissions: CommunicationCampaignPermissions
): CommunicationCampaignDTO {
  return {
    id: `campaign-${approvalStatus}`,
    name: "Campaign",
    description: null,
    prompt: null,
    knowledgeDocumentIds: [],
    audienceSourceId: null,
    audienceSourceName: "Audience",
    recipientCount: 1,
    tier: "STANDARD",
    channels: [],
    smartChanneling: false,
    fallbackPolicy: "NONE",
    status: "DRAFT",
    approvalRequired: true,
    approvalStatus,
    submittedByUserId: "creator-1",
    submittedAt: "2026-08-29T10:00:00.000Z",
    approvedByUserId: null,
    approvedAt: null,
    approvalReason: null,
    permissions: campaignPermissions,
    currentRevision: 1,
    approvedRevision: null,
    attemptedContactCount: 0,
    launchImmediately: true,
    scheduledAt: null,
    voiceCampaignId: null,
    ivrCampaignId: null,
    ivrFlowId: null,
    ivrRuntimeFlowId: null,
    createdAt: "2026-08-29T09:00:00.000Z",
    updatedAt: "2026-08-29T10:00:00.000Z",
    archivedAt: null,
    archivedByUserId: null,
  };
}

describe("communication campaign approval queue", () => {
  it("shows a submitted campaign to an eligible approver", () => {
    const submitted = campaign("SUBMITTED", permissions());
    expect(getPendingCampaignApprovals([submitted])).toEqual([submitted]);
  });

  it("shows a self-submitted campaign for review with decisions blocked", () => {
    const ownSubmission = campaign(
      "SUBMITTED",
      permissions({
        canApprove: false,
        canReject: false,
        canRequestChanges: false,
        selfApprovalBlocked: true,
      })
    );
    expect(getPendingCampaignApprovals([ownSubmission])).toEqual([
      ownSubmission,
    ]);
  });

  it("hides a submitted campaign outside the reviewer's tenant scope", () => {
    const crossTenant = campaign(
      "SUBMITTED",
      permissions({
        canReview: false,
        canApprove: false,
        canReject: false,
      })
    );
    expect(getPendingCampaignApprovals([crossTenant])).toEqual([]);
  });

  it("removes approved campaigns from pending review", () => {
    expect(
      getPendingCampaignApprovals([campaign("APPROVED", permissions())])
    ).toEqual([]);
  });

  it("removes rejected campaigns from pending review", () => {
    expect(
      getPendingCampaignApprovals([campaign("REJECTED", permissions())])
    ).toEqual([]);
  });
});
