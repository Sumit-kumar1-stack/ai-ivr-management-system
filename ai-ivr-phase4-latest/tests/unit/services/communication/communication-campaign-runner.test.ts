import {
  CommunicationCampaignApprovalStatus,
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationFallbackPolicy,
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
  recordAuditEvent: vi.fn(),
  resolveBillingContext: vi.fn(),
  assertEntitlements: vi.fn(),
  dispatchSms: vi.fn(),
  dispatchWhatsApp: vi.fn(),
  voiceRuntime: vi.fn(),
  ivrBridge: vi.fn(),
  finalize: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communicationCampaign: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  createServerLogger: vi.fn(() => ({
    warn: mocks.warn,
    info: mocks.info,
    error: mocks.error,
  })),
  normalizeError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  })),
}));

vi.mock("@/services/audit/audit-event.service", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/services/billing/tenant-subscription.service", () => ({
  resolveTenantBillingContextForTenant:
    mocks.resolveBillingContext,
}));

vi.mock("@/services/communication/communication-entitlement.service", () => ({
  assertCommunicationCampaignEntitlements:
    mocks.assertEntitlements,
}));

vi.mock("@/services/communication/communication-messaging-dispatch.service", () => ({
  dispatchCommunicationSms: mocks.dispatchSms,
  dispatchCommunicationWhatsApp: mocks.dispatchWhatsApp,
}));

vi.mock("@/services/communication/communication-voice-runtime.service", () => ({
  startCommunicationVoiceRuntime: mocks.voiceRuntime,
}));

vi.mock("@/services/communication/communication-ivr-bridge.service", () => ({
  startCommunicationIvrCampaign: mocks.ivrBridge,
}));

vi.mock("@/services/communication/communication-campaign-finalizer.service", () => ({
  tryFinalizeCommunicationCampaign: mocks.finalize,
}));

import { runCommunicationCampaign } from "@/services/communication/communication-campaign-runner.service";

describe("communication campaign runner preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.resolveBillingContext.mockResolvedValue({
      tenantId: "tenant-1",
      tenantStatus: "ACTIVE",
      subscription: {
        status: "ACTIVE",
      },
      effectiveCampaignTier: "PREMIUM",
    });

    mocks.assertEntitlements.mockReturnValue({
      plan: {
        tier: "PREMIUM",
        label: "Premium",
        features: {
          sms: true,
          whatsapp: true,
          aiVoice: true,
          ivr: true,
          smartChanneling: true,
          omnichannelFallback: true,
          advancedAnalytics: true,
          humanTransfer: true,
        },
        limits: {
          campaignConcurrency: 10,
          dailyRecipients: 100_000,
        },
      },
      voiceRuntime: "GEMINI_LIVE",
    });

    mocks.dispatchSms.mockResolvedValue({
      success: true,
    });
    mocks.dispatchWhatsApp.mockResolvedValue({
      success: true,
    });
    mocks.voiceRuntime.mockResolvedValue({
      queued: false,
      voiceCampaignId: null,
    });
    mocks.ivrBridge.mockResolvedValue({
      queued: false,
      ivrCampaignId: null,
    });
    mocks.finalize.mockResolvedValue(undefined);
    mocks.recordAuditEvent.mockResolvedValue(undefined);
  });

  it("drops duplicate running jobs before dispatching work", async () => {
    mocks.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    mocks.findUnique.mockResolvedValueOnce({
      status: CommunicationCampaignStatus.RUNNING,
    });

    const result = await runCommunicationCampaign("campaign-1");

    expect(result.recipientCount).toBe(0);
    expect(mocks.resolveBillingContext).not.toHaveBeenCalled();
    expect(mocks.dispatchSms).not.toHaveBeenCalled();
  });

  it("fails closed when approval is stale at execution time", async () => {
    mocks.updateMany.mockResolvedValueOnce({
      count: 1,
    });
    mocks.findUnique.mockResolvedValueOnce({
      id: "campaign-1",
      status: CommunicationCampaignStatus.RUNNING,
      approvalRequired: true,
      approvalStatus:
        CommunicationCampaignApprovalStatus.APPROVED,
      currentRevision: 2,
      approvedRevision: 1,
      archivedAt: null,
      tier: "PREMIUM",
      channels: [CommunicationChannel.SMS],
      smartChanneling: false,
      fallbackPolicy:
        CommunicationFallbackPolicy.NONE,
      recipients: [
        {
          id: "recipient-1",
          phone: "+15551234567",
          fullName: "Customer",
        },
      ],
      ownerUser: {
        tenantId: "tenant-1",
      },
    });
    mocks.updateMany.mockResolvedValueOnce({
      count: 1,
    });

    await expect(
      runCommunicationCampaign("campaign-1")
    ).rejects.toThrow(
      "Communication campaign approval is stale or no longer valid"
    );

    expect(mocks.resolveBillingContext).toHaveBeenCalledWith(
      "tenant-1"
    );
    expect(mocks.assertEntitlements).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        action: "WORKER_EXECUTION_DENIED",
        result: "DENIED",
      })
    );
  });
});
