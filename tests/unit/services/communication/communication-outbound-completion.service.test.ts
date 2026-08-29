import {
  CommunicationCampaignStatus,
  CommunicationOutboundAttemptStatus,
  CommunicationRecipientStatus,
} from "@prisma/client";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  callbackCount: vi.fn(),
  outboundEmit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communicationCampaign: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
    callbackRequest: {
      count: mocks.callbackCount,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  createServerLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  normalizeError: vi.fn(),
}));
vi.mock("@/services/audit/audit-event.service", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/services/communication/communication-outbound-events.service", () => ({
  OUTBOUND_REALTIME_EVENTS: {
    CAMPAIGN_COMPLETED: "campaign.completed",
    PROGRESS_UPDATED: "campaign.progress.updated",
  },
  publishOutboundEvent: mocks.outboundEmit,
}));

import {
  finalizeCommunicationCampaignIfReady,
} from "@/services/communication/communication-campaign-finalizer.service";

function campaign(input?: {
  status?: CommunicationCampaignStatus;
  attemptStatus?: CommunicationOutboundAttemptStatus;
  recipientStatus?: CommunicationRecipientStatus;
  attemptCount?: number;
  nextAttemptAt?: Date | null;
}) {
  return {
    id: "campaign-1",
    status: input?.status ?? CommunicationCampaignStatus.RUNNING,
    maxAttempts: 3,
    channels: [],
    fallbackPolicy: "NONE",
    voiceCampaignId: null,
    voiceCampaign: null,
    ivrCampaignId: null,
    ivrCampaign: null,
    ownerUser: { tenantId: "tenant-1" },
    calls: [],
    outboundAttempts: [{
      status: input?.attemptStatus ?? CommunicationOutboundAttemptStatus.COMPLETED,
    }],
    recipients: [{
      id: "recipient-1",
      phone: "+15551234567",
      status: input?.recipientStatus ?? CommunicationRecipientStatus.COMPLETED,
      attemptCount: input?.attemptCount ?? 1,
      nextAttemptAt: input?.nextAttemptAt ?? null,
      lastError: null,
      messages: [],
    }],
  };
}

describe("provider-neutral campaign completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.callbackCount.mockResolvedValue(0);
  });

  it.each([
    CommunicationOutboundAttemptStatus.QUEUED,
    CommunicationOutboundAttemptStatus.CLAIMED,
  ])("does not finalize while a %s attempt remains", async attemptStatus => {
    mocks.findUnique.mockResolvedValue(campaign({ attemptStatus }));
    const result = await finalizeCommunicationCampaignIfReady("campaign-1");
    expect(result.finalized).toBe(false);
    expect(result.unresolvedRecipients).toBeGreaterThan(0);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not finalize an eligible unsent recipient with retry budget", async () => {
    mocks.findUnique.mockResolvedValue(campaign({
      recipientStatus: CommunicationRecipientStatus.PENDING,
      attemptCount: 1,
    }));
    await expect(finalizeCommunicationCampaignIfReady("campaign-1")).resolves.toMatchObject({ finalized: false });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not finalize deferred future work", async () => {
    mocks.findUnique.mockResolvedValue(campaign({
      recipientStatus: CommunicationRecipientStatus.PENDING,
      nextAttemptAt: new Date("2026-08-30T10:00:00.000Z"),
    }));
    await expect(finalizeCommunicationCampaignIfReady("campaign-1")).resolves.toMatchObject({ finalized: false });
  });

  it("does not finalize while paused", async () => {
    mocks.findUnique.mockResolvedValue(campaign({ status: CommunicationCampaignStatus.PAUSED }));
    await expect(finalizeCommunicationCampaignIfReady("campaign-1")).resolves.toMatchObject({ finalized: false });
  });

  it("does not finalize while an outbound callback remains active", async () => {
    const snapshot = {
      ...campaign(),
      calls: [{ id: "call-1" }],
    };
    mocks.findUnique.mockResolvedValue(snapshot);
    mocks.callbackCount.mockResolvedValue(1);
    await expect(finalizeCommunicationCampaignIfReady("campaign-1")).resolves.toMatchObject({
      finalized: false,
      unresolvedRecipients: 1,
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("moves RUNNING to COMPLETED only after every attempt and recipient settles", async () => {
    mocks.findUnique.mockResolvedValue(campaign());
    const result = await finalizeCommunicationCampaignIfReady("campaign-1");
    expect(result).toMatchObject({ finalized: true, status: CommunicationCampaignStatus.COMPLETED });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: [CommunicationCampaignStatus.RUNNING, CommunicationCampaignStatus.DISPATCHED] } }),
      data: { status: CommunicationCampaignStatus.COMPLETED },
    }));
  });

  it("settles to FAILED when every terminal recipient failed or was skipped", async () => {
    mocks.findUnique.mockResolvedValue(campaign({ recipientStatus: CommunicationRecipientStatus.FAILED }));
    await expect(finalizeCommunicationCampaignIfReady("campaign-1")).resolves.toMatchObject({
      finalized: true,
      status: CommunicationCampaignStatus.FAILED,
    });
  });

  it.each([
    CommunicationCampaignStatus.COMPLETED,
    CommunicationCampaignStatus.CANCELLED,
  ])("does not revive or re-finalize terminal campaign %s", async status => {
    mocks.findUnique.mockResolvedValue(campaign({ status }));
    await expect(finalizeCommunicationCampaignIfReady("campaign-1")).resolves.toMatchObject({
      finalized: false,
      skipped: true,
      status,
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
