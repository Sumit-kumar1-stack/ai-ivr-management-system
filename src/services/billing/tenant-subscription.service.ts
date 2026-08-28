import {
  AuditEventOutcome,
  CommunicationTier,
  Prisma,
  SubscriptionPlanTier,
  SubscriptionEventStatus,
  SubscriptionStatus,
  TenantStatus,
} from "@prisma/client";

import {
  getCommunicationPlan,
  type CommunicationPlan,
} from "@/config/communication-plan";

import {
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

import {
  recordAuditEvent,
} from "@/services/audit/audit-event.service";

export const BILLING_ENTITLEMENT_KEYS = [
  "SMS",
  "WHATSAPP",
  "AI_VOICE",
  "IVR",
  "PREMIUM_VOICE",
  "SMART_CHANNELING",
  "ADVANCED_ANALYTICS",
  "OMNICHANNEL_FALLBACK",
  "HUMAN_TRANSFER",
  "ENTERPRISE_CONTRACT",
] as const;

export type BillingEntitlementKey =
  (typeof BILLING_ENTITLEMENT_KEYS)[number];

const log =
  createServerLogger(
    "tenant-billing"
  );

const STANDARD_ENTITLEMENTS =
  [
    "SMS",
    "WHATSAPP",
    "AI_VOICE",
    "IVR",
  ] satisfies BillingEntitlementKey[];

const PREMIUM_ENTITLEMENTS =
  [
    ...STANDARD_ENTITLEMENTS,
    "PREMIUM_VOICE",
    "SMART_CHANNELING",
    "ADVANCED_ANALYTICS",
    "OMNICHANNEL_FALLBACK",
    "HUMAN_TRANSFER",
  ] satisfies BillingEntitlementKey[];

const ENTERPRISE_ENTITLEMENTS =
  [
    ...PREMIUM_ENTITLEMENTS,
    "ENTERPRISE_CONTRACT",
  ] satisfies BillingEntitlementKey[];

export interface TenantBillingSubscriptionSnapshot {
  id: string;
  tenantId: string;
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerPriceId: string | null;
  contractReference: string | null;
  planTier: SubscriptionPlanTier;
  status: SubscriptionStatus;
  entitlements: BillingEntitlementKey[];
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  cancelledAt: Date | null;
  expiredAt: Date | null;
  lastProviderEventId: string | null;
  lastProviderEventType: string | null;
}

export interface TenantBillingContext {
  tenantId: string;
  tenantStatus: TenantStatus;
  subscription: TenantBillingSubscriptionSnapshot;
  deploymentPlan: CommunicationPlan;
  effectiveCampaignTier: CommunicationTier;
  tenantEntitlements: Set<BillingEntitlementKey>;
  premiumVoiceEnabled: boolean;
  launchAllowed: boolean;
}

export interface ApplyTenantBillingEventInput {
  provider: string;
  providerEventId: string;
  tenantId: string;
  eventType: string;
  planTier: SubscriptionPlanTier;
  status: SubscriptionStatus;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  providerPriceId?: string | null;
  contractReference?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  payload: Prisma.InputJsonValue;
  signatureVerified: boolean;
}

function toEntitlementSet(
  planTier: SubscriptionPlanTier
): Set<BillingEntitlementKey> {
  if (
    planTier === SubscriptionPlanTier.ENTERPRISE
  ) {
    return new Set(
      ENTERPRISE_ENTITLEMENTS
    );
  }

  if (
    planTier === SubscriptionPlanTier.PREMIUM
  ) {
    return new Set(
      PREMIUM_ENTITLEMENTS
    );
  }

  return new Set(
    STANDARD_ENTITLEMENTS
  );
}

function normalizeEntitlements(
  values: string[] | null | undefined
): BillingEntitlementKey[] {
  const allowed =
    new Set<string>(
      BILLING_ENTITLEMENT_KEYS
    );

  return Array.from(
    new Set(
      (values ?? [])
        .filter(
          value =>
            allowed.has(value)
        )
        .map(
          value =>
            value as BillingEntitlementKey
        )
    )
  );
}

function buildEntitlementSnapshot(
  planTier: SubscriptionPlanTier
): BillingEntitlementKey[] {
  return Array.from(
    toEntitlementSet(
      planTier
    )
  );
}

function isPremiumDeploymentSupported(
  deploymentPlan: CommunicationPlan
): boolean {
  return deploymentPlan.tier === "PREMIUM";
}

function getEffectiveCampaignTier(
  deploymentPlan: CommunicationPlan,
  subscription: TenantBillingSubscriptionSnapshot,
  tenantStatus: TenantStatus
): CommunicationTier {
  if (
    tenantStatus !== TenantStatus.ACTIVE
  ) {
    return CommunicationTier.STANDARD;
  }

  if (
    subscription.status !==
    SubscriptionStatus.ACTIVE
  ) {
    return CommunicationTier.STANDARD;
  }

  if (
    !isPremiumDeploymentSupported(
      deploymentPlan
    )
  ) {
    return CommunicationTier.STANDARD;
  }

  if (
    subscription.planTier ===
      SubscriptionPlanTier.PREMIUM ||
    subscription.planTier ===
      SubscriptionPlanTier.ENTERPRISE
  ) {
    return CommunicationTier.PREMIUM;
  }

  return CommunicationTier.STANDARD;
}

function toSnapshot(
  subscription: {
    id: string;
    tenantId: string;
    provider: string | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    providerPriceId: string | null;
    contractReference: string | null;
    planTier: SubscriptionPlanTier;
    status: SubscriptionStatus;
    entitlements: string[];
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
    activatedAt: Date | null;
    suspendedAt: Date | null;
    cancelledAt: Date | null;
    expiredAt: Date | null;
    lastProviderEventId: string | null;
    lastProviderEventType: string | null;
  }
): TenantBillingSubscriptionSnapshot {
  return {
    ...subscription,
    entitlements:
      normalizeEntitlements(
        subscription.entitlements
      ),
  };
}

async function resolveTenantBillingContext(
  tenantId: string
): Promise<TenantBillingContext> {
  const tenant =
    await prisma.tenant.findUnique({
      where: {
        id: tenantId,
      },

      select: {
        id: true,
        status: true,
        subscription: {
          select: {
            id: true,
            tenantId: true,
            provider: true,
            providerCustomerId: true,
            providerSubscriptionId: true,
            providerPriceId: true,
            contractReference: true,
            planTier: true,
            status: true,
            entitlements: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
            activatedAt: true,
            suspendedAt: true,
            cancelledAt: true,
            expiredAt: true,
            lastProviderEventId: true,
            lastProviderEventType: true,
          },
        },
      },
    });

  if (
    !tenant ||
    !tenant.subscription
  ) {
    throw new NotFoundError(
      "Tenant subscription not found"
    );
  }

  const deploymentPlan =
    getCommunicationPlan();

  const subscription =
    toSnapshot(
      tenant.subscription
    );

  const effectiveCampaignTier =
    getEffectiveCampaignTier(
      deploymentPlan,
      subscription,
      tenant.status
    );

  const tenantEntitlements =
    new Set(
      computeTenantEntitlementsForPlan(
        subscription.planTier,
        subscription.status
      )
    );

  return {
    tenantId: tenant.id,
    tenantStatus: tenant.status,
    subscription,
    deploymentPlan,
    effectiveCampaignTier,
    tenantEntitlements,
    premiumVoiceEnabled:
      tenant.status ===
        TenantStatus.ACTIVE &&
      subscription.status ===
        SubscriptionStatus.ACTIVE &&
      tenantEntitlements.has(
        "PREMIUM_VOICE"
      ) &&
      deploymentPlan.tier ===
        "PREMIUM",
    launchAllowed:
      tenant.status ===
        TenantStatus.ACTIVE &&
      subscription.status ===
        SubscriptionStatus.ACTIVE,
  };
}

export async function resolveTenantBillingContextForUser(
  userId: string
): Promise<TenantBillingContext> {
  const user =
    await prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        tenantId: true,
      },
    });

  if (
    !user?.tenantId
  ) {
    throw new ValidationError(
      "Authenticated user is not attached to a tenant"
    );
  }

  return resolveTenantBillingContext(
    user.tenantId
  );
}

export async function resolveTenantBillingContextForTenant(
  tenantId: string
): Promise<TenantBillingContext> {
  return resolveTenantBillingContext(
    tenantId
  );
}

export function computeTenantEntitlementsForPlan(
  planTier: SubscriptionPlanTier,
  status: SubscriptionStatus
): BillingEntitlementKey[] {
  if (status !== SubscriptionStatus.ACTIVE) {
    return [];
  }

  return buildEntitlementSnapshot(
    planTier
  );
}

export function normalizeSubscriptionPlanTier(
  input: string
): SubscriptionPlanTier {
  const normalized =
    input.trim().toUpperCase();

  if (
    normalized === "PREMIUM"
  ) {
    return SubscriptionPlanTier.PREMIUM;
  }

  if (
    normalized === "ENTERPRISE"
  ) {
    return SubscriptionPlanTier.ENTERPRISE;
  }

  return SubscriptionPlanTier.STANDARD;
}

export function normalizeSubscriptionStatus(
  input: string
): SubscriptionStatus {
  const normalized =
    input.trim().toUpperCase();

  if (
    normalized === "ACTIVE"
  ) {
    return SubscriptionStatus.ACTIVE;
  }

  if (
    normalized === "PAST_DUE"
  ) {
    return SubscriptionStatus.PAST_DUE;
  }

  if (
    normalized === "CANCELLED"
  ) {
    return SubscriptionStatus.CANCELLED;
  }

  if (
    normalized === "SUSPENDED"
  ) {
    return SubscriptionStatus.SUSPENDED;
  }

  if (
    normalized === "EXPIRED"
  ) {
    return SubscriptionStatus.EXPIRED;
  }

  return SubscriptionStatus.TRIALING;
}

export async function applyTenantBillingEvent(
  input: ApplyTenantBillingEventInput
): Promise<TenantBillingContext> {
  const tenantId =
    input.tenantId.trim();

  if (
    !tenantId
  ) {
    throw new ValidationError(
      "Tenant ID is required"
    );
  }

  const providerEventId =
    input.providerEventId.trim();

  if (
    !providerEventId
  ) {
    throw new ValidationError(
      "Provider event ID is required"
    );
  }

  const existingEvent =
    await prisma.tenantPaymentEvent.findUnique(
      {
        where: {
          providerEventId,
        },

        select: {
          id: true,
          tenantId: true,
          subscriptionId: true,
          providerEventId: true,
          processedAt: true,
          status: true,
        },
      }
    );

  if (
    existingEvent?.status ===
    SubscriptionEventStatus.APPLIED
  ) {
    log.info(
      {
        event:
          "billing.event.duplicate",

        tenantId,

        providerEventId,
      },
      "Duplicate billing event ignored"
    );

    return resolveTenantBillingContext(
      tenantId
    );
  }

  const previousSubscription =
    await prisma.tenantSubscription.findUnique(
      {
        where: {
          tenantId,
        },

        select: {
          id: true,
          planTier: true,
          status: true,
          entitlements: true,
        },
      }
    );

  try {
    await prisma.tenantPaymentEvent.upsert(
      {
        where: {
          providerEventId,
        },

        update: {
          tenantId,
          provider: input.provider,
          eventType: input.eventType,
          status: SubscriptionEventStatus.RECEIVED,
          payload: input.payload,
          signatureVerified: input.signatureVerified,
        },

        create: {
          tenantId,
          provider:
            input.provider,
          providerEventId,
          eventType:
            input.eventType,
          status:
            SubscriptionEventStatus.RECEIVED,
          payload:
            input.payload,
          signatureVerified:
            input.signatureVerified,
        },
      }
    );
  } catch (
    error
  ) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code ===
        "P2002"
    ) {
      return resolveTenantBillingContext(
        tenantId
      );
    }

    throw error;
  }

  try {
    await prisma.$transaction(
      async tx => {
        const subscription =
          await tx.tenantSubscription.upsert(
            {
              where: {
                tenantId,
              },

              create: {
                tenantId,
                provider:
                  input.provider,
                providerCustomerId:
                  input.providerCustomerId ??
                  null,
                providerSubscriptionId:
                  input.providerSubscriptionId ??
                  null,
                providerPriceId:
                  input.providerPriceId ??
                  null,
                contractReference:
                  input.contractReference ??
                  null,
                planTier:
                  input.planTier,
                status:
                  input.status,
                entitlements:
                  computeTenantEntitlementsForPlan(
                    input.planTier,
                    input.status
                  ),
                currentPeriodStart:
                  input.currentPeriodStart ??
                  null,
                currentPeriodEnd:
                  input.currentPeriodEnd ??
                  null,
                trialEndsAt:
                  input.trialEndsAt ??
                  null,
                activatedAt:
                  input.status ===
                  SubscriptionStatus.ACTIVE
                    ? new Date()
                    : null,
                suspendedAt:
                  input.status ===
                  SubscriptionStatus.SUSPENDED
                    ? new Date()
                    : null,
                cancelledAt:
                  input.status ===
                  SubscriptionStatus.CANCELLED
                    ? new Date()
                    : null,
                expiredAt:
                  input.status ===
                  SubscriptionStatus.EXPIRED
                    ? new Date()
                    : null,
                lastProviderEventId:
                  providerEventId,
                lastProviderEventType:
                  input.eventType,
              },

              update: {
                provider:
                  input.provider,
                providerCustomerId:
                  input.providerCustomerId ??
                  null,
                providerSubscriptionId:
                  input.providerSubscriptionId ??
                  null,
                providerPriceId:
                  input.providerPriceId ??
                  null,
                contractReference:
                  input.contractReference ??
                  null,
                planTier:
                  input.planTier,
                status:
                  input.status,
                entitlements:
                  computeTenantEntitlementsForPlan(
                    input.planTier,
                    input.status
                  ),
                currentPeriodStart:
                  input.currentPeriodStart ??
                  null,
                currentPeriodEnd:
                  input.currentPeriodEnd ??
                  null,
                trialEndsAt:
                  input.trialEndsAt ??
                  null,
                activatedAt:
                  input.status ===
                  SubscriptionStatus.ACTIVE
                    ? new Date()
                    : null,
                suspendedAt:
                  input.status ===
                  SubscriptionStatus.SUSPENDED
                    ? new Date()
                    : null,
                cancelledAt:
                  input.status ===
                  SubscriptionStatus.CANCELLED
                    ? new Date()
                    : null,
                expiredAt:
                  input.status ===
                  SubscriptionStatus.EXPIRED
                    ? new Date()
                    : null,
                lastProviderEventId:
                  providerEventId,
                lastProviderEventType:
                  input.eventType,
              },
            }
          );

        await tx.tenantPaymentEvent.update(
          {
            where: {
              providerEventId,
            },

            data: {
              subscriptionId:
                subscription.id,
              status:
                SubscriptionEventStatus.APPLIED,
              processedAt:
                new Date(),
              appliedAt:
                new Date(),
            },
          }
        );
      }
    );
  } catch (
    error
  ) {
    await prisma.tenantPaymentEvent.update(
      {
        where: {
          providerEventId,
        },

        data: {
          status:
            SubscriptionEventStatus.FAILED,
          processedAt:
            new Date(),
          errorMessage:
            normalizeError(
              error
            ).message,
        },
      }
    );

    throw error;
  }

  const billingContext =
    await resolveTenantBillingContext(
      tenantId
    );

  await recordAuditEvent({
    tenantId,
    actor: null,
    actorType: "SYSTEM",
    entityType: "TenantSubscription",
    resourceType: "TenantSubscription",
    resourceId: billingContext.subscription.id,
    action:
      previousSubscription
        ? "SUBSCRIPTION_CHANGED"
        : "SUBSCRIPTION_CREATED",
    outcome: AuditEventOutcome.SUCCEEDED,
    result: "SUCCEEDED",
    metadata: {
      provider: input.provider,
      providerEventId,
      eventType: input.eventType,
      previousPlanTier:
        previousSubscription?.planTier ?? null,
      previousStatus:
        previousSubscription?.status ?? null,
      planTier: input.planTier,
      status: input.status,
    },
  });

  if (input.status === SubscriptionStatus.ACTIVE) {
    await recordAuditEvent({
      tenantId,
      actor: null,
      actorType: "SYSTEM",
      entityType: "Payment",
      resourceType: "Payment",
      resourceId: providerEventId,
      action: "PAYMENT_RECEIVED",
      outcome: AuditEventOutcome.SUCCEEDED,
      result: "SUCCEEDED",
      metadata: {
        provider: input.provider,
        providerEventId,
        eventType: input.eventType,
        subscriptionId: billingContext.subscription.id,
      },
    });
  } else if (
    input.status === SubscriptionStatus.PAST_DUE ||
    input.status === SubscriptionStatus.CANCELLED ||
    input.status === SubscriptionStatus.SUSPENDED ||
    input.status === SubscriptionStatus.EXPIRED
  ) {
    await recordAuditEvent({
      tenantId,
      actor: null,
      actorType: "SYSTEM",
      entityType: "Payment",
      resourceType: "Payment",
      resourceId: providerEventId,
      action: "PAYMENT_FAILED",
      outcome: AuditEventOutcome.SUCCEEDED,
      result: "SUCCEEDED",
      metadata: {
        provider: input.provider,
        providerEventId,
        eventType: input.eventType,
        subscriptionId: billingContext.subscription.id,
      },
    });
  }

  const previousEntitlements = new Set<
    BillingEntitlementKey
  >(
    normalizeEntitlements(
      previousSubscription?.entitlements
    )
  );
  const currentEntitlements = new Set<
    BillingEntitlementKey
  >(
    billingContext.subscription.entitlements
  );

  for (const entitlement of billingContext.subscription.entitlements) {
    if (!previousEntitlements.has(entitlement)) {
      await recordAuditEvent({
        tenantId,
        actor: null,
        actorType: "SYSTEM",
        entityType: "TenantEntitlement",
        resourceType: "TenantEntitlement",
        resourceId: entitlement,
        action: "ENTITLEMENT_GRANTED",
        outcome: AuditEventOutcome.SUCCEEDED,
        result: "SUCCEEDED",
        metadata: {
          provider: input.provider,
          providerEventId,
          entitlement,
          planTier: input.planTier,
        },
      });
    }
  }

  for (const entitlement of previousEntitlements) {
    if (!currentEntitlements.has(entitlement)) {
      await recordAuditEvent({
        tenantId,
        actor: null,
        actorType: "SYSTEM",
        entityType: "TenantEntitlement",
        resourceType: "TenantEntitlement",
        resourceId: entitlement,
        action: "ENTITLEMENT_REVOKED",
        outcome: AuditEventOutcome.SUCCEEDED,
        result: "SUCCEEDED",
        metadata: {
          provider: input.provider,
          providerEventId,
          entitlement,
          planTier: input.planTier,
        },
      });
    }
  }

  return billingContext;
}

export async function createDefaultTrialSubscription(
  tenantId: string
): Promise<void> {
  await prisma.tenantSubscription.upsert(
    {
      where: {
        tenantId,
      },

      create: {
        tenantId,
        provider: null,
        planTier:
          SubscriptionPlanTier.STANDARD,
        status:
          SubscriptionStatus.TRIALING,
        entitlements:
          computeTenantEntitlementsForPlan(
            SubscriptionPlanTier.STANDARD,
            SubscriptionStatus.TRIALING
          ),
        activatedAt:
          null,
        lastProviderEventId:
          null,
        lastProviderEventType:
          null,
      },

      update: {
        provider: null,
        providerCustomerId: null,
        providerSubscriptionId: null,
        providerPriceId: null,
        contractReference: null,
        planTier:
          SubscriptionPlanTier.STANDARD,
        status:
          SubscriptionStatus.TRIALING,
        entitlements:
          computeTenantEntitlementsForPlan(
            SubscriptionPlanTier.STANDARD,
            SubscriptionStatus.TRIALING
          ),
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        activatedAt: null,
        suspendedAt: null,
        cancelledAt: null,
        expiredAt: null,
        lastProviderEventId: null,
        lastProviderEventType: null,
      },
    }
  );
}
