import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  AuthenticatedUser,
} from "@/lib/auth";

const mocks =
  vi.hoisted(
    () => ({
      findUnique:
        vi.fn(),

      enqueue:
        vi.fn(),

      deployAvailable:
        vi.fn(),

      entitlement:
        vi.fn(),

      requireFlow:
        vi.fn(),

      reserve:
        vi.fn(),

      compensate:
        vi.fn(),

      resolveBillingContext:
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
        findUnique:
          mocks.findUnique,
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
    createLogger:
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

    normalizeError:
      vi.fn(
        (error: unknown) => ({
          message:
            error instanceof Error
              ? error.message
              : String(error),
        })
      ),
  })
);

vi.mock(
  "@/config/communication-deployment-capabilities",
  () => ({
    assertCommunicationDeploymentChannelsAvailable:
      mocks.deployAvailable,
  })
);

vi.mock(
  "@/services/communication/communication-entitlement.service",
  () => ({
    assertCommunicationCampaignEntitlements:
      mocks.entitlement,
  })
);

vi.mock(
  "@/services/communication/communication-ivr-binding.service",
  () => ({
    requirePublishedCommunicationIvrFlow:
      mocks.requireFlow,
  })
);

vi.mock(
  "@/services/billing/tenant-subscription.service",
  () => ({
    resolveTenantBillingContextForUser:
      mocks.resolveBillingContext,
  })
);

vi.mock(
  "@/services/communication/communication-usage-limit.service",
  () => ({
    reserveCommunicationCampaignLaunch:
      mocks.reserve,

    compensateCommunicationCampaignQueueFailure:
      mocks.compensate,
  })
);

vi.mock(
  "@/services/communication/communication-campaign-queue.service",
  () => ({
    CommunicationCampaignQueueService: {
      enqueue:
        mocks.enqueue,
    },
  })
);

import {
  launchCommunicationCampaign,
} from "@/services/communication/communication-launch.service";

describe("communication launch gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entitlement.mockReturnValue({
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
    mocks.reserve.mockResolvedValue({
      usageDate: new Date("2026-08-22T00:00:00.000Z"),
      activeCampaignsAfter: 1,
      concurrencyLimit: 10,
      dailyRecipientsUsedAfter: 1,
      dailyRecipientsLimit: 100_000,
    });
    mocks.enqueue.mockResolvedValue(undefined);
    mocks.compensate.mockResolvedValue(undefined);
    mocks.resolveBillingContext.mockResolvedValue({
      tenantId: "tenant-1",
      tenantStatus: "ACTIVE",
      subscription: {
        id: "subscription-1",
        tenantId: "tenant-1",
        provider: "stripe",
        providerCustomerId: "cus_1",
        providerSubscriptionId: "sub_1",
        providerPriceId: "price_1",
        contractReference: null,
        planTier: "PREMIUM",
        status: "ACTIVE",
        entitlements: ["SMS", "AI_VOICE", "PREMIUM_VOICE"],
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        activatedAt: new Date(),
        suspendedAt: null,
        cancelledAt: null,
        expiredAt: null,
        lastProviderEventId: "evt-1",
        lastProviderEventType: "invoice.paid",
      },
      deploymentPlan: {
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
        voice: {
          runtime: "GEMINI_LIVE",
        },
      },
      effectiveCampaignTier: "PREMIUM",
      tenantEntitlements: new Set(["SMS", "AI_VOICE", "PREMIUM_VOICE"]),
      premiumVoiceEnabled: true,
      launchAllowed: true,
    });

    mocks.findUnique.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
      status: "READY",
      approvalRequired: true,
      approvalStatus: "SUBMITTED",
      submittedByUserId: "user-1",
      approvedByUserId: null,
      approvedAt: null,
      tier: "STANDARD",
      launchImmediately: true,
      scheduledAt: null,
      channels: ["SMS"],
      smartChanneling: false,
      fallbackPolicy: "NONE",
      ivrFlowId: null,
      _count: {
        recipients: 1,
      },
    });
  });

  const currentUser =
    {
      id: "user-1",
      fullName: "Admin User",
      email: "admin@ivr.com",
      role: "ADMIN",
      campaignCapabilities: [
        "CAMPAIGN_CREATE",
        "CAMPAIGN_EDIT",
        "CAMPAIGN_SUBMIT",
        "CAMPAIGN_LAUNCH",
      ],
      phone: null,
      avatar: null,
      tenantId: "tenant-1",
      tenantName: "Demo Tenant",
      tenantStatus: "ACTIVE",
      accountStatus: "ACTIVE",
      isActive: true,
    } as AuthenticatedUser;

  it("rejects launch before approval without reserving queue or quota", async () => {
    await expect(
      launchCommunicationCampaign(
        "campaign-1",
        currentUser
      )
    ).rejects.toThrow(
      "Communication campaign is not approved for launch"
    );

    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it("uses the authoritative billing tier instead of the stored campaign tier", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
      status: "READY",
      approvalRequired: true,
      approvalStatus: "APPROVED",
      submittedByUserId: "user-1",
      approvedByUserId: "user-2",
      approvedAt: new Date(),
      tier: "PREMIUM",
      launchImmediately: true,
      scheduledAt: null,
      channels: ["SMS"],
      smartChanneling: false,
      fallbackPolicy: "NONE",
      ivrFlowId: null,
      _count: {
        recipients: 1,
      },
    });

    mocks.resolveBillingContext.mockResolvedValue({
      tenantId: "tenant-1",
      tenantStatus: "ACTIVE",
      subscription: {
        id: "subscription-1",
        tenantId: "tenant-1",
        provider: "stripe",
        providerCustomerId: "cus_1",
        providerSubscriptionId: "sub_1",
        providerPriceId: "price_1",
        contractReference: null,
        planTier: "STANDARD",
        status: "ACTIVE",
        entitlements: ["SMS"],
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        activatedAt: new Date(),
        suspendedAt: null,
        cancelledAt: null,
        expiredAt: null,
        lastProviderEventId: "evt-2",
        lastProviderEventType: "invoice.paid",
      },
      deploymentPlan: {
        tier: "STANDARD",
        label: "Standard",
        features: {
          sms: true,
          whatsapp: false,
          aiVoice: true,
          ivr: true,
          smartChanneling: false,
          omnichannelFallback: false,
          advancedAnalytics: false,
          humanTransfer: false,
        },
        limits: {
          campaignConcurrency: 2,
          dailyRecipients: 1_000,
        },
        voice: {
          runtime: "TWILIO",
        },
      },
      effectiveCampaignTier: "STANDARD",
      tenantEntitlements: new Set(["SMS"]),
      premiumVoiceEnabled: false,
      launchAllowed: true,
    });

    mocks.entitlement.mockReturnValue({
      plan: {
        tier: "STANDARD",
        label: "Standard",
        features: {
          sms: true,
          whatsapp: false,
          aiVoice: true,
          ivr: true,
          smartChanneling: false,
          omnichannelFallback: false,
          advancedAnalytics: false,
          humanTransfer: false,
        },
        limits: {
          campaignConcurrency: 2,
          dailyRecipients: 1_000,
        },
      },
      voiceRuntime: "TWILIO",
    });
    mocks.reserve.mockResolvedValue({
      usageDate: new Date("2026-08-22T00:00:00.000Z"),
      activeCampaignsAfter: 1,
      concurrencyLimit: 2,
      dailyRecipientsUsedAfter: 1,
      dailyRecipientsLimit: 1_000,
    });

    const result =
      await launchCommunicationCampaign(
        "campaign-1",
        currentUser
      );

    expect(mocks.entitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "STANDARD",
      })
    );
    expect(result.tier).toBe("STANDARD");
    expect(mocks.reserve).toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalled();
  });

  it("blocks launch when the subscription is not active", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
      status: "READY",
      approvalRequired: true,
      approvalStatus: "APPROVED",
      submittedByUserId: "user-1",
      approvedByUserId: "user-2",
      approvedAt: new Date(),
      tier: "STANDARD",
      launchImmediately: true,
      scheduledAt: null,
      channels: ["SMS"],
      smartChanneling: false,
      fallbackPolicy: "NONE",
      ivrFlowId: null,
      _count: {
        recipients: 1,
      },
    });

    mocks.resolveBillingContext.mockResolvedValue({
      tenantId: "tenant-1",
      tenantStatus: "ACTIVE",
      subscription: {
        id: "subscription-1",
        tenantId: "tenant-1",
        provider: "stripe",
        providerCustomerId: "cus_1",
        providerSubscriptionId: "sub_1",
        providerPriceId: "price_1",
        contractReference: null,
        planTier: "STANDARD",
        status: "PAST_DUE",
        entitlements: [],
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        activatedAt: null,
        suspendedAt: null,
        cancelledAt: null,
        expiredAt: null,
        lastProviderEventId: "evt-3",
        lastProviderEventType: "invoice.failed",
      },
      deploymentPlan: {
        tier: "STANDARD",
        label: "Standard",
        features: {
          sms: true,
          whatsapp: false,
          aiVoice: true,
          ivr: true,
          smartChanneling: false,
          omnichannelFallback: false,
          advancedAnalytics: false,
          humanTransfer: false,
        },
        limits: {
          campaignConcurrency: 2,
          dailyRecipients: 1_000,
        },
        voice: {
          runtime: "TWILIO",
        },
      },
      effectiveCampaignTier: "STANDARD",
      tenantEntitlements: new Set<string>(),
      premiumVoiceEnabled: false,
      launchAllowed: false,
    });

    mocks.entitlement.mockReturnValue({
      plan: {
        tier: "STANDARD",
        label: "Standard",
        features: {
          sms: true,
          whatsapp: false,
          aiVoice: true,
          ivr: true,
          smartChanneling: false,
          omnichannelFallback: false,
          advancedAnalytics: false,
          humanTransfer: false,
        },
        limits: {
          campaignConcurrency: 2,
          dailyRecipients: 1_000,
        },
      },
      voiceRuntime: "TWILIO",
    });
    mocks.reserve.mockResolvedValue({
      usageDate: new Date("2026-08-22T00:00:00.000Z"),
      activeCampaignsAfter: 1,
      concurrencyLimit: 2,
      dailyRecipientsUsedAfter: 1,
      dailyRecipientsLimit: 1_000,
    });

    await expect(
      launchCommunicationCampaign(
        "campaign-1",
        currentUser
      )
    ).rejects.toThrow(
      "Tenant subscription is not active"
    );
  });

  it("denies an approver-only user from launching an approved campaign", async () => {
    const approverUser =
      {
        id: "user-2",
        fullName: "Approver",
        email: "approver@ivr.com",
        role: "ADMIN",
        campaignCapabilities: [
          "CAMPAIGN_REVIEW",
          "CAMPAIGN_APPROVE",
          "CAMPAIGN_REJECT",
        ],
        phone: null,
        avatar: null,
        tenantId: "tenant-1",
        tenantName: "Demo Tenant",
        tenantStatus: "ACTIVE",
        accountStatus: "ACTIVE",
        isActive: true,
      } as AuthenticatedUser;

    mocks.findUnique.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
      status: "READY",
      approvalRequired: true,
      approvalStatus: "APPROVED",
      submittedByUserId: "user-1",
      approvedByUserId: "user-2",
      approvedAt: new Date(),
      tier: "STANDARD",
      launchImmediately: true,
      scheduledAt: null,
      channels: ["SMS"],
      smartChanneling: false,
      fallbackPolicy: "NONE",
      ivrFlowId: null,
      _count: {
        recipients: 1,
      },
    });

    await expect(
      launchCommunicationCampaign(
        "campaign-1",
        approverUser
      )
    ).rejects.toThrow(
      "You are not authorized to launch this communication campaign"
    );
  });

  it("denies a tenant B user from launching tenant A campaign", async () => {
    const tenantBUser =
      {
        id: "user-3",
        fullName: "Tenant B User",
        email: "tenantb@ivr.com",
        role: "ADMIN",
        campaignCapabilities: [
          "CAMPAIGN_LAUNCH",
        ],
        phone: null,
        avatar: null,
        tenantId: "tenant-2",
        tenantName: "Tenant B",
        tenantStatus: "ACTIVE",
        accountStatus: "ACTIVE",
        isActive: true,
      } as AuthenticatedUser;

    mocks.findUnique.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
      status: "READY",
      approvalRequired: true,
      approvalStatus: "APPROVED",
      submittedByUserId: "user-1",
      approvedByUserId: "user-2",
      approvedAt: new Date(),
      tier: "STANDARD",
      launchImmediately: true,
      scheduledAt: null,
      channels: ["SMS"],
      smartChanneling: false,
      fallbackPolicy: "NONE",
      ivrFlowId: null,
      _count: {
        recipients: 1,
      },
    });

    await expect(
      launchCommunicationCampaign(
        "campaign-1",
        tenantBUser
      )
    ).rejects.toThrow(
      "You are not authorized to launch this communication campaign"
    );
  });

  it("blocks launch when approval is stale after a material edit", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "campaign-1",
      ownerUserId: "user-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
      status: "READY",
      approvalRequired: true,
      approvalStatus: "APPROVED",
      submittedByUserId: "user-1",
      approvedByUserId: "user-2",
      approvedAt: new Date(),
      tier: "STANDARD",
      launchImmediately: true,
      scheduledAt: null,
      channels: ["SMS"],
      smartChanneling: false,
      fallbackPolicy: "NONE",
      ivrFlowId: null,
      currentRevision: 3,
      approvedRevision: 2,
      _count: {
        recipients: 1,
      },
    });

    await expect(
      launchCommunicationCampaign(
        "campaign-1",
        currentUser
      )
    ).rejects.toThrow(
      "Communication campaign approval is stale and must be resubmitted"
    );
  });
});
