import {
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
      findFirst:
        vi.fn(),

      findUniqueOrThrow:
        vi.fn(),

      updateMany:
        vi.fn(),

      update:
        vi.fn(),

      auditCreate:
        vi.fn(),

      info:
        vi.fn(),

      warn:
        vi.fn(),

      error:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      communicationCampaign: {
        findFirst:
          mocks.findFirst,

        findUniqueOrThrow:
          mocks.findUniqueOrThrow,

        updateMany:
          mocks.updateMany,

        update:
          mocks.update,
      },

      auditEvent: {
        create:
          mocks.auditCreate,
      },
    },
  })
);

vi.mock(
  "@/lib/logger",
  () => ({
    createServerLogger:
      vi.fn(
        () => ({
          info:
            mocks.info,

          warn:
            mocks.warn,

          error:
            mocks.error,
        })
      ),
  })
);

import {
  approveCommunicationCampaign,
  rejectCommunicationCampaign,
  requestChangesCommunicationCampaign,
} from "@/services/communication/communication-campaign.service";

const approver = {
  id: "user-2",
  role: UserRole.ADMIN,
  campaignCapabilities: [
    "CAMPAIGN_REVIEW",
    "CAMPAIGN_APPROVE",
    "CAMPAIGN_REJECT",
  ],
  tenantId: "tenant-1",
} as const;

describe("communication campaign approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects self-approval by the maker", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-2",
      submittedByUserId: "user-2",
      approvalRequired: true,
      approvalStatus: "SUBMITTED",
      currentRevision: 2,
      approvedRevision: null,
      ownerUser: {
        tenantId: "tenant-1",
      },
    });

    await expect(
      approveCommunicationCampaign(
        "campaign-1",
        approver
      )
    ).rejects.toThrow(
      "The same user cannot approve their own communication campaign"
    );
  });

  it("rejects self-approval by the submitter when the creator is different", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
      submittedByUserId: "user-2",
      approvalRequired: true,
      approvalStatus: "SUBMITTED",
      currentRevision: 2,
      approvedRevision: null,
      ownerUser: {
        tenantId: "tenant-1",
      },
    });

    await expect(
      approveCommunicationCampaign(
        "campaign-1",
        approver
      )
    ).rejects.toThrow(
      "The same user cannot approve their own communication campaign"
    );
  });

  it("rejects self-rejection by SUPER_ADMIN", async () => {
    const superAdmin = {
      id: "platform-1",
      role: UserRole.SUPER_ADMIN,
      campaignCapabilities: [],
      tenantId: "tenant-1",
    } as const;

    mocks.findFirst.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "platform-1",
      submittedByUserId: "platform-1",
      approvalRequired: true,
      approvalStatus: "SUBMITTED",
      currentRevision: 2,
      approvedRevision: null,
      ownerUser: {
        tenantId: "tenant-1",
      },
    });

    await expect(
      rejectCommunicationCampaign(
        "campaign-1",
        superAdmin,
        { reason: "Not ready" }
      )
    ).rejects.toThrow(
      "The same user cannot reject their own communication campaign"
    );

    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("allows a different reviewer to approve", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
      submittedByUserId: "user-1",
      approvalRequired: true,
      approvalStatus: "SUBMITTED",
      currentRevision: 2,
      approvedRevision: null,
      ownerUser: {
        tenantId: "tenant-1",
      },
    });

    mocks.update.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
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
      status: "READY",
      approvalRequired: true,
      approvalStatus: "APPROVED",
      submittedByUserId: "user-1",
      submittedAt: new Date("2026-08-19T09:00:00.000Z"),
      approvedByUserId: "user-2",
      approvedAt: new Date("2026-08-20T09:00:00.000Z"),
      approvalReason: null,
      currentRevision: 2,
      approvedRevision: 2,
      attemptedContactCount: 0,
      launchImmediately: true,
      scheduledAt: null,
      archivedAt: null,
      archivedByUserId: null,
      voiceCampaignId: null,
      ivrCampaignId: null,
      ivrFlowId: null,
      ivrRuntimeFlowId: null,
      createdAt: new Date("2026-08-19T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T09:00:00.000Z"),
    });

    mocks.updateMany.mockResolvedValue({
      count: 1,
    });

    mocks.auditCreate.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
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
      status: "READY",
      approvalRequired: true,
      approvalStatus: "APPROVED",
      submittedByUserId: "user-1",
      submittedAt: new Date("2026-08-19T09:00:00.000Z"),
      approvedByUserId: "user-2",
      approvedAt: new Date("2026-08-20T09:00:00.000Z"),
      approvalReason: null,
      currentRevision: 2,
      approvedRevision: 2,
      attemptedContactCount: 0,
      launchImmediately: true,
      scheduledAt: null,
      archivedAt: null,
      archivedByUserId: null,
      voiceCampaignId: null,
      ivrCampaignId: null,
      ivrFlowId: null,
      ivrRuntimeFlowId: null,
      createdAt: new Date("2026-08-19T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T09:00:00.000Z"),
    });

    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "campaign-1",
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
      status: "READY",
      approvalRequired: true,
      approvalStatus: "APPROVED",
      submittedByUserId: "user-1",
      submittedAt: new Date("2026-08-19T09:00:00.000Z"),
      approvedByUserId: "user-2",
      approvedAt: new Date("2026-08-20T09:00:00.000Z"),
      approvalReason: null,
      currentRevision: 2,
      approvedRevision: 2,
      attemptedContactCount: 0,
      launchImmediately: true,
      scheduledAt: null,
      archivedAt: null,
      archivedByUserId: null,
      voiceCampaignId: null,
      ivrCampaignId: null,
      ivrFlowId: null,
      ivrRuntimeFlowId: null,
      createdAt: new Date("2026-08-19T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T09:00:00.000Z"),
    });

    const result =
      await approveCommunicationCampaign(
        "campaign-1",
        approver
      );

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "campaign-1",

          ownerUser: {
            tenantId: "tenant-1",
          },
        },
      })
    );

    expect(result.approvalStatus).toBe("APPROVED");
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalStatus: "APPROVED",
          approvedByUserId: "user-2",
          status: "READY",
        }),
      })
    );
  });

  it("rejects cross-tenant approval attempts as not found", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      rejectCommunicationCampaign(
        "campaign-tenant-b",
        approver,
        {
          reason: "Not aligned with policy",
        }
      )
    ).rejects.toThrow(
      "Communication campaign not found"
    );
  });

  it("supports requesting changes on a submitted campaign", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
      submittedByUserId: "user-1",
      approvalRequired: true,
      approvalStatus: "SUBMITTED",
      currentRevision: 2,
      approvedRevision: null,
      ownerUser: {
        tenantId: "tenant-1",
      },
    });

    mocks.updateMany.mockResolvedValue({
      count: 1,
    });

    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "campaign-1",
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
      approvalStatus: "REJECTED",
      submittedByUserId: "user-1",
      submittedAt: new Date("2026-08-19T09:00:00.000Z"),
      approvedByUserId: "user-2",
      approvedAt: new Date("2026-08-20T09:00:00.000Z"),
      approvalReason: "Please revise the opening message",
      currentRevision: 2,
      approvedRevision: null,
      attemptedContactCount: 0,
      launchImmediately: true,
      scheduledAt: null,
      archivedAt: null,
      archivedByUserId: null,
      voiceCampaignId: null,
      ivrCampaignId: null,
      ivrFlowId: null,
      ivrRuntimeFlowId: null,
      createdAt: new Date("2026-08-19T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T09:00:00.000Z"),
    });

    const result =
      await requestChangesCommunicationCampaign(
        "campaign-1",
        approver,
        {
          reason: "Please revise the opening message",
        }
      );

    expect(result.approvalStatus).toBe(
      "REJECTED"
    );
    expect(mocks.updateMany).toHaveBeenCalled();
  });
});
