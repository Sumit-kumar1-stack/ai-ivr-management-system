import {
  CommunicationCampaignStatus,
  UserRole,
} from "@prisma/client";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  enqueue: vi.fn(),
  removePending: vi.fn(),
  audit: vi.fn(),
  outboundEmit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
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
  recordAuditEvent: mocks.audit,
}));

vi.mock("@/services/communication/communication-campaign-queue.service", () => ({
  CommunicationCampaignQueueService: {
    enqueue: mocks.enqueue,
    removePendingCampaignJobs: mocks.removePending,
  },
}));
vi.mock("@/services/communication/communication-outbound-events.service", () => ({
  OUTBOUND_REALTIME_EVENTS: { PROGRESS_UPDATED: "campaign.progress.updated" },
  publishOutboundEvent: mocks.outboundEmit,
}));

import {
  cancelCommunicationCampaign,
  isCommunicationRuntimeTransitionAllowed,
  pauseCommunicationCampaign,
  resumeCommunicationCampaign,
} from "@/services/communication/communication-campaign-runtime-lifecycle.service";

const actor = {
  id: "operator-1",
  role: UserRole.ADMIN,
  tenantId: "tenant-1",
  campaignCapabilities: ["CAMPAIGN_LAUNCH" as const],
};

function campaign(
  status: CommunicationCampaignStatus,
  scheduledAt: Date | null = null
) {
  return {
    id: "campaign-1",
    status,
    scheduledAt,
    businessHoursPolicy: null,
    ownerUser: { tenantId: "tenant-1" },
  };
}

describe("communication campaign runtime lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.enqueue.mockResolvedValue({ id: "job-1" });
    mocks.removePending.mockResolvedValue(2);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("defines the allowed transition matrix centrally", () => {
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.RUNNING, CommunicationCampaignStatus.PAUSED)).toBe(true);
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.SCHEDULED, CommunicationCampaignStatus.PAUSED)).toBe(true);
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.PAUSED, CommunicationCampaignStatus.RUNNING)).toBe(true);
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.PAUSED, CommunicationCampaignStatus.SCHEDULED)).toBe(true);
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.RUNNING, CommunicationCampaignStatus.CANCELLED)).toBe(true);
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.SCHEDULED, CommunicationCampaignStatus.CANCELLED)).toBe(true);
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.PAUSED, CommunicationCampaignStatus.CANCELLED)).toBe(true);
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.SCHEDULED, CommunicationCampaignStatus.RUNNING)).toBe(true);
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.RUNNING, CommunicationCampaignStatus.COMPLETED)).toBe(true);
    expect(isCommunicationRuntimeTransitionAllowed(CommunicationCampaignStatus.COMPLETED, CommunicationCampaignStatus.RUNNING)).toBe(false);
  });

  it("pauses RUNNING work without changing recipients or attempts", async () => {
    mocks.findFirst.mockResolvedValue(campaign(CommunicationCampaignStatus.RUNNING));
    const result = await pauseCommunicationCampaign("campaign-1", actor);
    expect(result.status).toBe(CommunicationCampaignStatus.PAUSED);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: CommunicationCampaignStatus.RUNNING }),
      data: { status: CommunicationCampaignStatus.PAUSED },
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "campaign.paused" }));
    expect(mocks.outboundEmit).toHaveBeenCalledWith(
      "campaign.progress.updated",
      { tenantId: "tenant-1", campaignId: "campaign-1" },
      { status: CommunicationCampaignStatus.PAUSED }
    );
  });

  it("pauses SCHEDULED work", async () => {
    mocks.findFirst.mockResolvedValue(campaign(CommunicationCampaignStatus.SCHEDULED));
    await expect(pauseCommunicationCampaign("campaign-1", actor)).resolves.toMatchObject({ status: CommunicationCampaignStatus.PAUSED });
  });

  it("resumes immediately to RUNNING and reuses the deterministic campaign queue", async () => {
    mocks.findFirst.mockResolvedValue(campaign(CommunicationCampaignStatus.PAUSED));
    const result = await resumeCommunicationCampaign("campaign-1", actor, new Date("2026-08-29T10:00:00.000Z"));
    expect(result.status).toBe(CommunicationCampaignStatus.RUNNING);
    expect(mocks.enqueue).toHaveBeenCalledWith({ communicationCampaignId: "campaign-1" }, 0);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "campaign.resumed" }));
  });

  it("resumes a future campaign to SCHEDULED with its remaining delay", async () => {
    mocks.findFirst.mockResolvedValue(campaign(
      CommunicationCampaignStatus.PAUSED,
      new Date("2026-08-29T11:00:00.000Z")
    ));
    const result = await resumeCommunicationCampaign("campaign-1", actor, new Date("2026-08-29T10:00:00.000Z"));
    expect(result.status).toBe(CommunicationCampaignStatus.SCHEDULED);
    expect(mocks.enqueue).toHaveBeenCalledWith({ communicationCampaignId: "campaign-1" }, 3_600_000);
  });

  it("resumes outside business hours to the next SCHEDULED window", async () => {
    mocks.findFirst.mockResolvedValue({
      ...campaign(CommunicationCampaignStatus.PAUSED),
      businessHoursPolicy: {
        timezone: "UTC",
        enabledDays: [6],
        startTime: "11:00",
        endTime: "12:00",
      },
    });

    const result = await resumeCommunicationCampaign(
      "campaign-1",
      actor,
      new Date("2026-08-29T10:00:00.000Z")
    );

    expect(result).toMatchObject({
      status: CommunicationCampaignStatus.SCHEDULED,
      scheduledAt: "2026-08-29T11:00:00.000Z",
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      { communicationCampaignId: "campaign-1" },
      3_600_000
    );
  });

  it("compensates resume back to PAUSED when Redis enqueue fails", async () => {
    mocks.findFirst.mockResolvedValue(campaign(CommunicationCampaignStatus.PAUSED));
    mocks.enqueue.mockRejectedValue(new Error("redis unavailable"));
    await expect(resumeCommunicationCampaign("campaign-1", actor)).rejects.toThrow("redis unavailable");
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ status: CommunicationCampaignStatus.RUNNING }),
      data: { status: CommunicationCampaignStatus.PAUSED },
    }));
  });

  it("cancels and removes only waiting/delayed queue work", async () => {
    mocks.findFirst.mockResolvedValue(campaign(CommunicationCampaignStatus.RUNNING));
    const result = await cancelCommunicationCampaign("campaign-1", actor);
    expect(result).toMatchObject({ status: CommunicationCampaignStatus.CANCELLED, removedPendingJobs: 2, queueCleanupFailed: false });
    expect(mocks.removePending).toHaveBeenCalledWith("campaign-1");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "campaign.cancelled" }));
  });

  it("keeps canonical cancellation when Redis cleanup is unavailable", async () => {
    mocks.findFirst.mockResolvedValue(campaign(CommunicationCampaignStatus.PAUSED));
    mocks.removePending.mockRejectedValue(new Error("redis unavailable"));
    await expect(cancelCommunicationCampaign("campaign-1", actor)).resolves.toMatchObject({
      status: CommunicationCampaignStatus.CANCELLED,
      queueCleanupFailed: true,
    });
  });

  it("rejects invalid transitions deterministically", async () => {
    mocks.findFirst.mockResolvedValue(campaign(CommunicationCampaignStatus.COMPLETED));
    await expect(pauseCommunicationCampaign("campaign-1", actor)).rejects.toThrow("COMPLETED -> PAUSED is not allowed");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("blocks missing capabilities and cross-tenant access", async () => {
    await expect(pauseCommunicationCampaign("campaign-1", {
      ...actor,
      campaignCapabilities: [],
    })).rejects.toThrow();
    expect(mocks.findFirst).not.toHaveBeenCalled();

    mocks.findFirst.mockResolvedValue(null);
    await expect(pauseCommunicationCampaign("campaign-1", actor)).rejects.toThrow("not found");
  });

  it("keeps SUPER_ADMIN within the current tenant-scoped governance", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(cancelCommunicationCampaign("campaign-1", {
      ...actor,
      role: UserRole.SUPER_ADMIN,
      campaignCapabilities: [],
    })).rejects.toThrow("not found");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ownerUser: { tenantId: "tenant-1" } }),
    }));
  });
});
