import { NextRequest, NextResponse } from "next/server";

import {
  AuditEventOutcome,
  UserRole,
} from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { createAuthErrorResponse } from "@/lib/auth-response";
import {
  applyTenantBillingEvent,
  normalizeSubscriptionPlanTier,
  normalizeSubscriptionStatus,
} from "@/services/billing/tenant-subscription.service";

import {
  extractAuditRequestContext,
} from "@/services/audit/audit-context";

import {
  recordAuditEvent,
} from "@/services/audit/audit-event.service";

interface RouteContext {
  params: Promise<{
    tenantId: string;
  }>;
}

const TenantSubscriptionUpdateSchema = z.object({
  planTier: z.enum([
    "STANDARD",
    "PREMIUM",
    "ENTERPRISE",
  ]),
  status: z.enum([
    "TRIALING",
    "ACTIVE",
    "PAST_DUE",
    "CANCELLED",
    "SUSPENDED",
    "EXPIRED",
  ]),
  provider: z.string().min(1).default("enterprise-contract"),
  providerEventId: z.string().min(1).optional(),
  providerSubscriptionId: z.string().optional().nullable(),
  providerCustomerId: z.string().optional().nullable(),
  providerPriceId: z.string().optional().nullable(),
  contractReference: z.string().optional().nullable(),
  currentPeriodStart: z.string().datetime().optional().nullable(),
  currentPeriodEnd: z.string().datetime().optional().nullable(),
  trialEndsAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const actor = await requireRole([
      UserRole.SUPER_ADMIN,
    ] as const);
    const { tenantId } = await params;
    const auditContext = extractAuditRequestContext(request);
    const body = await request.json();
    const parsed = TenantSubscriptionUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request data",
          errors: parsed.error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    const eventId =
      parsed.data.providerEventId ??
      [
        "manual-contract",
        tenantId,
        parsed.data.planTier,
        parsed.data.status,
        parsed.data.contractReference ?? "none",
      ].join(":");

    const context = await applyTenantBillingEvent({
      provider: parsed.data.provider,
      providerEventId: eventId,
      tenantId,
      eventType: "enterprise.contract.updated",
      planTier: normalizeSubscriptionPlanTier(parsed.data.planTier),
      status: normalizeSubscriptionStatus(parsed.data.status),
      providerSubscriptionId: parsed.data.providerSubscriptionId,
      providerCustomerId: parsed.data.providerCustomerId,
      providerPriceId: parsed.data.providerPriceId,
      contractReference: parsed.data.contractReference,
      currentPeriodStart: parsed.data.currentPeriodStart
        ? new Date(parsed.data.currentPeriodStart)
        : null,
      currentPeriodEnd: parsed.data.currentPeriodEnd
        ? new Date(parsed.data.currentPeriodEnd)
        : null,
      trialEndsAt: parsed.data.trialEndsAt
        ? new Date(parsed.data.trialEndsAt)
        : null,
      payload: {
        ...parsed.data,
        actorUserId: actor.id,
        notes: parsed.data.notes ?? null,
      },
      signatureVerified: true,
    });

    await recordAuditEvent({
      tenantId,
      actor: {
        id: actor.id,
        role: actor.role,
        tenantId: actor.tenantId,
      },
      actorType: "USER",
      entityType: "TenantSubscription",
      resourceType: "TenantSubscription",
      resourceId: context.subscription.id,
      action: "SUBSCRIPTION_CHANGED",
      outcome: AuditEventOutcome.SUCCEEDED,
      result: "SUCCEEDED",
      ipAddress: auditContext.ipAddress,
      correlationId: auditContext.correlationId,
      metadata: {
        provider: parsed.data.provider,
        providerEventId: eventId,
        planTier: context.subscription.planTier,
        subscriptionStatus: context.subscription.status,
      },
    });

    if (context.tenantStatus === "ACTIVE") {
      await recordAuditEvent({
        tenantId,
        actor: {
          id: actor.id,
          role: actor.role,
          tenantId: actor.tenantId,
        },
        actorType: "USER",
        entityType: "Tenant",
        resourceType: "Tenant",
        resourceId: tenantId,
        action: "TENANT_ACTIVATED",
        outcome: AuditEventOutcome.SUCCEEDED,
        result: "SUCCEEDED",
        ipAddress: auditContext.ipAddress,
        correlationId: auditContext.correlationId,
      });
    } else if (context.tenantStatus === "SUSPENDED") {
      await recordAuditEvent({
        tenantId,
        actor: {
          id: actor.id,
          role: actor.role,
          tenantId: actor.tenantId,
        },
        actorType: "USER",
        entityType: "Tenant",
        resourceType: "Tenant",
        resourceId: tenantId,
        action: "TENANT_SUSPENDED",
        outcome: AuditEventOutcome.SUCCEEDED,
        result: "SUCCEEDED",
        ipAddress: auditContext.ipAddress,
        correlationId: auditContext.correlationId,
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Tenant subscription updated successfully",
        data: {
          tenantId: context.tenantId,
          tenantStatus: context.tenantStatus,
          subscriptionStatus: context.subscription.status,
          planTier: context.subscription.planTier,
          entitlements: Array.from(context.tenantEntitlements),
          premiumVoiceEnabled: context.premiumVoiceEnabled,
          launchAllowed: context.launchAllowed,
        },
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    console.error("Failed to update tenant subscription", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update tenant subscription",
      },
      {
        status: 500,
      }
    );
  }
}
