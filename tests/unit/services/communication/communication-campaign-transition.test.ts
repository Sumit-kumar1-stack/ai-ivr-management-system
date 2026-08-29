import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communicationCampaign: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("@/services/audit/audit-event.service", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { transitionCommunicationCampaign } from "@/services/communication/communication-campaign-transition.service";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-1",
    status: "DRAFT",
    approvalStatus: "DRAFT",
    approvalRequired: true,
    submittedByUserId: null,
    approvedByUserId: null,
    approvedAt: null,
    approvedRevision: null,
    currentRevision: 1,
    approvalReason: null,
    archivedAt: null,
    archivedByUserId: null,
    ownerUserId: "creator-1",
    ownerUser: { tenantId: "tenant-1" },
    ...overrides,
  };
}

describe("communication campaign governance transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.recordAuditEvent.mockResolvedValue({ id: "audit-1" });
  });

  it("submits a creator campaign for approval and records its maker identity", async () => {
    mocks.findFirst.mockResolvedValue(snapshot());

    await transitionCommunicationCampaign({
      campaignId: "campaign-1",
      actor: {
        id: "creator-1",
        role: UserRole.ADMIN,
        tenantId: "tenant-1",
        campaignCapabilities: ["CAMPAIGN_SUBMIT"],
      },
      requestedTransition: "SUBMIT_FOR_APPROVAL",
    });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalStatus: "SUBMITTED",
          submittedByUserId: "creator-1",
          submittedAt: expect.any(Date),
        }),
      })
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CAMPAIGN_SUBMITTED",
        outcome: "SUCCEEDED",
      })
    );
  });

  it("allows SUPER_ADMIN to approve another tenant's submission", async () => {
    mocks.findFirst.mockResolvedValue(
      snapshot({
        approvalStatus: "SUBMITTED",
        submittedByUserId: "creator-1",
        ownerUser: { tenantId: "tenant-b" },
      })
    );

    await transitionCommunicationCampaign({
      campaignId: "campaign-1",
      actor: {
        id: "platform-1",
        role: UserRole.SUPER_ADMIN,
        tenantId: null,
        campaignCapabilities: [],
      },
      requestedTransition: "APPROVE",
    });

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "campaign-1" } })
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalStatus: "APPROVED",
          approvedByUserId: "platform-1",
          status: "READY",
        }),
      })
    );
  });

  it("blocks SUPER_ADMIN from approving its own submission", async () => {
    mocks.findFirst.mockResolvedValue(
      snapshot({
        approvalStatus: "SUBMITTED",
        ownerUserId: "platform-1",
        submittedByUserId: "platform-1",
      })
    );

    await expect(
      transitionCommunicationCampaign({
        campaignId: "campaign-1",
        actor: {
          id: "platform-1",
          role: UserRole.SUPER_ADMIN,
          tenantId: null,
          campaignCapabilities: [],
        },
        requestedTransition: "APPROVE",
      })
    ).rejects.toThrow(
      "The same user cannot approve their own communication campaign"
    );

    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
