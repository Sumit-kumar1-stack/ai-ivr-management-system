import { NextResponse } from "next/server";

import type {
  Prisma,
} from "@prisma/client";

import { z } from "zod";

import {
  BILLING_WEBHOOK_SIGNATURE_HEADER,
  verifyBillingWebhookSignature,
} from "@/lib/billing-webhook-auth";

import { createAuthErrorResponse } from "@/lib/auth-response";
import {
  applyTenantBillingEvent,
  normalizeSubscriptionPlanTier,
  normalizeSubscriptionStatus,
} from "@/services/billing/tenant-subscription.service";

const BillingWebhookSchema = z.object({
  provider: z.string().min(1),
  providerEventId: z.string().min(1),
  tenantId: z.string().min(1),
  eventType: z.string().min(1),
  planTier: z.string().min(1),
  status: z.string().min(1),
  providerSubscriptionId: z.string().optional().nullable(),
  providerCustomerId: z.string().optional().nullable(),
  providerPriceId: z.string().optional().nullable(),
  contractReference: z.string().optional().nullable(),
  currentPeriodStart: z.string().datetime().optional().nullable(),
  currentPeriodEnd: z.string().datetime().optional().nullable(),
  trialEndsAt: z.string().datetime().optional().nullable(),
  metadata: z
    .record(
      z.string(),
      z.unknown()
    )
    .optional(),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get(BILLING_WEBHOOK_SIGNATURE_HEADER);

    if (!signature) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing billing webhook signature",
        },
        {
          status: 401,
        }
      );
    }

    if (!verifyBillingWebhookSignature(rawBody, signature)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid billing webhook signature",
        },
        {
          status: 403,
        }
      );
    }

    const parsed = BillingWebhookSchema.safeParse(
      JSON.parse(rawBody)
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid billing webhook payload",
          errors: parsed.error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    const data = parsed.data;

    const payload:
      Prisma.InputJsonValue =
      {
        ...data,
        metadata:
          data.metadata ?? null,
      } as Prisma.InputJsonValue;

    const context = await applyTenantBillingEvent({
      provider: data.provider,
      providerEventId: data.providerEventId,
      tenantId: data.tenantId,
      eventType: data.eventType,
      planTier: normalizeSubscriptionPlanTier(data.planTier),
      status: normalizeSubscriptionStatus(data.status),
      providerSubscriptionId: data.providerSubscriptionId,
      providerCustomerId: data.providerCustomerId,
      providerPriceId: data.providerPriceId,
      contractReference: data.contractReference,
      currentPeriodStart: data.currentPeriodStart
        ? new Date(data.currentPeriodStart)
        : null,
      currentPeriodEnd: data.currentPeriodEnd
        ? new Date(data.currentPeriodEnd)
        : null,
      trialEndsAt: data.trialEndsAt
        ? new Date(data.trialEndsAt)
        : null,
      payload,
      signatureVerified: true,
    });

    return NextResponse.json({
      success: true,
      message: "Billing event processed successfully",
      data: {
        tenantId: context.tenantId,
        tenantStatus: context.tenantStatus,
        subscriptionStatus: context.subscription.status,
        planTier: context.subscription.planTier,
        entitlements: Array.from(context.tenantEntitlements),
        premiumVoiceEnabled: context.premiumVoiceEnabled,
        launchAllowed: context.launchAllowed,
      },
    });
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    console.error("Billing webhook failed", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Billing webhook failed",
      },
      {
        status: 500,
      }
    );
  }
}
