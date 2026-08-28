import {
  SubscriptionPlanTier,
  SubscriptionStatus,
  TenantStatus,
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
      tenantPaymentEvent: {
        findUnique:
          vi.fn(),
        upsert:
          vi.fn(),
        update:
          vi.fn(),
      },
      tenant: {
        findUnique:
          vi.fn(),
      },
      transaction: {
        tenantSubscription: {
          upsert:
            vi.fn(),
        },
        tenantPaymentEvent: {
          update:
            vi.fn(),
        },
      },
      logger: {
        info:
          vi.fn(),
        warn:
          vi.fn(),
        error:
          vi.fn(),
      },
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      tenantPaymentEvent:
        mocks.tenantPaymentEvent,
      tenant:
        mocks.tenant,
      $transaction:
        vi.fn(),
    },
  })
);

vi.mock(
  "@/lib/logger",
  () => ({
    createServerLogger:
      vi.fn(() => mocks.logger),
    normalizeError:
      vi.fn((error: unknown) => ({
        message:
          error instanceof Error
            ? error.message
            : String(error),
      })),
  })
);

vi.mock(
  "@/config/communication-plan",
  () => ({
    getCommunicationPlan:
      vi.fn(() => ({
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
      })),
  })
);

import {
  applyTenantBillingEvent,
} from "@/services/billing/tenant-subscription.service";

describe(
  "tenant billing service",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      (
        mocks.tenantPaymentEvent
          .findUnique
      ).mockResolvedValue({
        id: "billing-event-1",
        tenantId: "tenant-1",
        subscriptionId: "subscription-1",
        providerEventId: "evt_1",
        processedAt: new Date(),
        status: "APPLIED",
      });

      mocks.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        status: TenantStatus.ACTIVE,
        subscription: {
          id: "subscription-1",
          tenantId: "tenant-1",
          provider: "stripe",
          providerCustomerId: "cus_1",
          providerSubscriptionId: "sub_1",
          providerPriceId: "price_1",
          contractReference: null,
          planTier: SubscriptionPlanTier.PREMIUM,
          status: SubscriptionStatus.ACTIVE,
          entitlements: [
            "SMS",
            "WHATSAPP",
            "AI_VOICE",
            "IVR",
            "PREMIUM_VOICE",
          ],
          currentPeriodStart: null,
          currentPeriodEnd: null,
          trialEndsAt: null,
          activatedAt: new Date(),
          suspendedAt: null,
          cancelledAt: null,
          expiredAt: null,
          lastProviderEventId: "evt_1",
          lastProviderEventType: "invoice.paid",
        },
      });
    });

    it(
      "treats an already-applied provider event as idempotent",
      async () => {
        const context =
          await applyTenantBillingEvent({
            provider: "stripe",
            providerEventId: "evt_1",
            tenantId: "tenant-1",
            eventType: "invoice.paid",
            planTier: SubscriptionPlanTier.PREMIUM,
            status: SubscriptionStatus.ACTIVE,
            payload: {
              example: true,
            },
            signatureVerified: true,
          });

        expect(
          mocks.tenantPaymentEvent.upsert
        ).not.toHaveBeenCalled();

        expect(
          mocks.transaction
            .tenantSubscription
            .upsert
        ).not.toHaveBeenCalled();

        expect(
          context.subscription.status
        ).toBe(
          SubscriptionStatus.ACTIVE
        );

        expect(
          context.premiumVoiceEnabled
        ).toBe(true);
      }
    );
  }
);
