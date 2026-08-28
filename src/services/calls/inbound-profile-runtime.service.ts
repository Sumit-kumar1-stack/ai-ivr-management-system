import type { AuthenticatedUser } from "@/lib/auth";
import {
  ForbiddenError,
  NotFoundError,
} from "@/lib/app-error";
import { prisma } from "@/lib/prisma";
import {
  resolveTenantBillingContextForTenant,
} from "@/services/billing/tenant-subscription.service";

export type InboundProfileVoiceRuntime =
  | "CASCADED"
  | "GEMINI_LIVE";

type RuntimeActor = Pick<AuthenticatedUser, "id" | "tenantId">;

export async function updateInboundProfileVoiceRuntime(input: {
  inboundProfileId: string;
  voiceRuntime: InboundProfileVoiceRuntime;
  actor: RuntimeActor;
}) {
  const inboundProfileId = input.inboundProfileId.trim();
  const tenantId = input.actor.tenantId?.trim();

  if (!inboundProfileId || !tenantId) {
    throw new ForbiddenError("A tenant-scoped administrator is required");
  }

  const profile = await prisma.inboundProfile.findFirst({
    where: {
      id: inboundProfileId,
      tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
    },
  });

  if (!profile) {
    throw new NotFoundError("Inbound profile");
  }

  if (input.voiceRuntime === "GEMINI_LIVE") {
    const billing = await resolveTenantBillingContextForTenant(profile.tenantId);

    if (!billing.premiumVoiceEnabled) {
      throw new ForbiddenError(
        "Premium Realtime Voice requires the PREMIUM_VOICE entitlement"
      );
    }
  }

  const updated = await prisma.inboundProfile.update({
    where: {
      id: profile.id,
    },
    data: {
      voiceRuntime: input.voiceRuntime,
    },
    select: {
      id: true,
      name: true,
      voiceRuntime: true,
      updatedAt: true,
    },
  });

  return updated;
}
