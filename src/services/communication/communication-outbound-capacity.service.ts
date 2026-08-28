import {
  Prisma,
} from "@prisma/client";

import {
  getCommunicationPlanForTier,
} from "@/config/communication-plan";

import {
  prisma,
} from "@/lib/prisma";

export interface OutboundCapacityLimits {
  campaign: number | null;
  tenant: number | null;
  provider: number | null;
  global: number | null;
}

export interface OutboundCapacityPolicy {
  provider: string;
  limits: OutboundCapacityLimits;
  effectiveLimit: number | null;
}

export interface AcquireOutboundCapacityInput {
  attemptId: string;
  tenantId: string;
  campaignId: string;
  provider: string;
  limits: OutboundCapacityLimits;
  now?: Date;
  leaseDurationMs?: number;
}

export interface OutboundCapacityAcquisition {
  acquired: boolean;
  reused: boolean;
  blockedDimension: keyof OutboundCapacityLimits | null;
  effectiveLimit: number | null;
  leaseId: string | null;
}

const DEFAULT_LEASE_DURATION_MS =
  15 * 60 * 1000;

export function resolveOutboundCapacityPolicy(
  input: {
    tier: string;
    campaignLimit?: number | null;
    provider?: string | null;
    environment?: NodeJS.ProcessEnv;
  }
): OutboundCapacityPolicy {
  const environment =
    input.environment ?? process.env;

  const provider =
    normalizeProvider(
      input.provider ??
        environment.TELEPHONY_PROVIDER ??
        "MOCK"
    );

  const plan =
    getCommunicationPlanForTier(
      input.tier
    );

  const limits: OutboundCapacityLimits = {
    campaign:
      normalizeOptionalLimit(
        input.campaignLimit
      ),

    // The current plan contract has one explicit concurrency entitlement.
    // Until a distinct recipient-slot entitlement exists, it is the tenant
    // ceiling. No numeric fallback is introduced here.
    tenant:
      normalizeOptionalLimit(
        plan.limits.campaignConcurrency
      ),

    provider:
      readOptionalLimit(
        environment[
          `COMMUNICATION_OUTBOUND_${provider}_CONCURRENCY`
        ] ??
          environment.COMMUNICATION_OUTBOUND_PROVIDER_CONCURRENCY
      ),

    global:
      readOptionalLimit(
        environment.COMMUNICATION_OUTBOUND_GLOBAL_CONCURRENCY
      ),
  };

  return {
    provider,
    limits,
    effectiveLimit:
      resolveEffectiveOutboundLimit(
        limits
      ),
  };
}

export function resolveEffectiveOutboundLimit(
  limits: OutboundCapacityLimits
): number | null {
  const configured =
    Object.values(
      limits
    ).filter(
      (value): value is number =>
        value !== null
    );

  return configured.length > 0
    ? Math.min(...configured)
    : null;
}

export async function acquireOutboundCapacity(
  input: AcquireOutboundCapacityInput
): Promise<OutboundCapacityAcquisition> {
  const attemptId = input.attemptId.trim();
  const tenantId = input.tenantId.trim();
  const campaignId = input.campaignId.trim();
  const provider = normalizeProvider(input.provider);

  if (!attemptId || !tenantId || !campaignId) {
    throw new Error(
      "Outbound capacity identifiers are required"
    );
  }

  const now = input.now ?? new Date();
  const leaseDurationMs =
    normalizeLeaseDuration(
      input.leaseDurationMs
    );
  const effectiveLimit =
    resolveEffectiveOutboundLimit(
      input.limits
    );

  return prisma.$transaction(
    async transaction => {
      const lockKeys = [
        "communication-outbound:global",
        `communication-outbound:provider:${provider}`,
        `communication-outbound:tenant:${tenantId}`,
        `communication-outbound:campaign:${campaignId}`,
      ].sort();

      for (const lockKey of lockKeys) {
        await transaction.$queryRaw`
          SELECT 1
          FROM (
            SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
          ) AS lock_result
        `;
      }

      await transaction.communicationOutboundCapacityLease.deleteMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
      });

      const existing =
        await transaction.communicationOutboundCapacityLease.findUnique({
          where: {
            attemptId,
          },
        });

      if (existing) {
        return {
          acquired: true,
          reused: true,
          blockedDimension: null,
          effectiveLimit,
          leaseId: existing.id,
        };
      }

      const blockedDimension =
        await findBlockedDimension(
          transaction,
          {
            tenantId,
            campaignId,
            provider,
            now,
            limits: input.limits,
          }
        );

      if (blockedDimension) {
        return {
          acquired: false,
          reused: false,
          blockedDimension,
          effectiveLimit,
          leaseId: null,
        };
      }

      const lease =
        await transaction.communicationOutboundCapacityLease.create({
          data: {
            attemptId,
            tenantId,
            campaignId,
            provider,
            expiresAt:
              new Date(
                now.getTime() +
                  leaseDurationMs
              ),
          },
        });

      return {
        acquired: true,
        reused: false,
        blockedDimension: null,
        effectiveLimit,
        leaseId: lease.id,
      };
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function releaseOutboundCapacity(
  attemptId: string
): Promise<void> {
  const id = attemptId.trim();

  if (!id) {
    return;
  }

  await prisma.communicationOutboundCapacityLease.deleteMany({
    where: {
      attemptId: id,
    },
  });
}

async function findBlockedDimension(
  transaction: Prisma.TransactionClient,
  input: {
    tenantId: string;
    campaignId: string;
    provider: string;
    now: Date;
    limits: OutboundCapacityLimits;
  }
): Promise<keyof OutboundCapacityLimits | null> {
  const dimensions: Array<{
    name: keyof OutboundCapacityLimits;
    where: Prisma.CommunicationOutboundCapacityLeaseWhereInput;
  }> = [
    {
      name: "campaign",
      where: {
        campaignId: input.campaignId,
      },
    },
    {
      name: "tenant",
      where: {
        tenantId: input.tenantId,
      },
    },
    {
      name: "provider",
      where: {
        provider: input.provider,
      },
    },
    {
      name: "global",
      where: {},
    },
  ];

  for (const dimension of dimensions) {
    const limit = input.limits[dimension.name];

    if (limit === null) {
      continue;
    }

    const current =
      await transaction.communicationOutboundCapacityLease.count({
        where: {
          ...dimension.where,
          expiresAt: {
            gt: input.now,
          },
        },
      });

    if (current >= limit) {
      return dimension.name;
    }
  }

  return null;
}

function normalizeProvider(
  provider: string
): string {
  const normalized =
    provider.trim().toUpperCase();

  return normalized || "MOCK";
}

function normalizeOptionalLimit(
  value: number | null | undefined
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      "Outbound concurrency limits must be positive integers"
    );
  }

  return value;
}

function readOptionalLimit(
  value: string | null | undefined
): number | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return normalizeOptionalLimit(
    Number(normalized)
  );
}

function normalizeLeaseDuration(
  value: number | null | undefined
): number {
  if (value === null || value === undefined) {
    return DEFAULT_LEASE_DURATION_MS;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      "Outbound capacity lease duration must be a positive integer"
    );
  }

  return value;
}
