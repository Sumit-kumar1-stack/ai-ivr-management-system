import {
  prisma,
} from "@/lib/prisma";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  normalizeInboundProviderNumber,
} from "@/lib/telephony-number";

import {
  resolveTenantBillingContextForTenant,
} from "@/services/billing/tenant-subscription.service";

import type {
  CommunicationVoiceRuntime,
} from "@/config/communication-plan";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface ResolvedInboundConfiguration {
  inboundNumberId: string;
  tenantId: string;
  inboundProfileId: string;
  ivrFlowVersionId: string | null;
  defaultLanguage: string;
  knowledgeDocumentIds: string[];
  callbackEnabled: boolean;
  transferEnabled: boolean;
  requestedRuntime: CommunicationVoiceRuntime;
}

export type InboundConfigurationResolution =
  | {
      configured: true;
      configuration: ResolvedInboundConfiguration;
    }
  | {
      configured: false;
      reason:
        | "NUMBER_NOT_CONFIGURED"
        | "TENANT_NOT_ELIGIBLE"
        | "PREMIUM_VOICE_NOT_ENTITLED";
    };

const log =
  createServerLogger(
    "inbound-number-service"
  );

//--------------------------------------------------
// Resolve Active Inbound Number
//--------------------------------------------------

export async function resolveActiveInboundConfiguration(
  input: {
    provider: string;
    calledNumber: string;
  }
): Promise<InboundConfigurationResolution> {
  const provider =
    input.provider.trim().toUpperCase();

  const providerNumber =
    normalizeInboundProviderNumber(
      provider,
      input.calledNumber
    );

  if (
    !provider ||
    !providerNumber
  ) {
    return {
      configured: false,
      reason: "NUMBER_NOT_CONFIGURED",
    };
  }

  const inboundNumber =
    await prisma.inboundNumber.findFirst({
      where: {
        provider,
        providerNumber,
        active: true,
        inboundProfile: {
          active: true,
        },
      },
      select: {
        id: true,
        tenantId: true,
        inboundProfileId: true,
        inboundProfile: {
          select: {
            defaultLanguage: true,
            knowledgeDocumentIds: true,
            callbackEnabled: true,
            transferEnabled: true,
            ivrFlowVersionId: true,
            voiceRuntime: true,
          },
        },
      },
    });

  if (
    !inboundNumber
  ) {
    return {
      configured: false,
      reason: "NUMBER_NOT_CONFIGURED",
    };
  }

  let billing:
    Awaited<
      ReturnType<
        typeof resolveTenantBillingContextForTenant
      >
    >;

  try {
    billing =
      await resolveTenantBillingContextForTenant(
        inboundNumber.tenantId
      );
  } catch (
    error
  ) {
    log.warn(
      {
        event: "inbound.number.tenant_ineligible",
        tenantId: inboundNumber.tenantId,
        error: normalizeError(
          error
        ),
      },
      "Inbound number matched a tenant without an eligible subscription"
    );

    return {
      configured: false,
      reason: "TENANT_NOT_ELIGIBLE",
    };
  }

  if (
    !billing.launchAllowed ||
    !billing.tenantEntitlements.has(
      "AI_VOICE"
    )
  ) {
    return {
      configured: false,
      reason: "TENANT_NOT_ELIGIBLE",
    };
  }

  const requestedRuntime =
    inboundNumber.inboundProfile.voiceRuntime === "GEMINI_LIVE"
      ? "GEMINI_LIVE"
      : "CASCADED";

  if (
    requestedRuntime === "GEMINI_LIVE" &&
    !billing.premiumVoiceEnabled
  ) {
    log.warn(
      {
        event: "inbound.number.premium_runtime_denied",
        tenantId: inboundNumber.tenantId,
        inboundProfileId: inboundNumber.inboundProfileId,
      },
      "Inbound profile requested Premium voice without a Premium entitlement"
    );

    return {
      configured: false,
      reason: "PREMIUM_VOICE_NOT_ENTITLED",
    };
  }

  return {
    configured: true,
    configuration: {
      inboundNumberId: inboundNumber.id,
      tenantId: inboundNumber.tenantId,
      inboundProfileId:
        inboundNumber.inboundProfileId,
      ivrFlowVersionId:
        inboundNumber.inboundProfile.ivrFlowVersionId,
      defaultLanguage:
        inboundNumber
          .inboundProfile
          .defaultLanguage,
      knowledgeDocumentIds:
        toStringArray(
          inboundNumber
            .inboundProfile
            .knowledgeDocumentIds
        ),
      callbackEnabled:
        inboundNumber
          .inboundProfile
          .callbackEnabled,
      transferEnabled:
        inboundNumber
          .inboundProfile
          .transferEnabled,
      requestedRuntime,
    },
  };
}

//--------------------------------------------------
// Helpers
//--------------------------------------------------

function toStringArray(
  value: unknown
): string[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" &&
      item.trim().length > 0
  );
}
