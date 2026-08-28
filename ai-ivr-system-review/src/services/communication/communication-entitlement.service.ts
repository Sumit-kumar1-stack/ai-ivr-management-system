import {
  CommunicationChannel,
  CommunicationFallbackPolicy,
} from "@prisma/client";

import {
  getCommunicationPlanForTier,
  type CommunicationPlan,
  type CommunicationVoiceRuntime,
} from "@/config/communication-plan";

//--------------------------------------------------
// Campaign Entitlement Input
//--------------------------------------------------

export interface CommunicationCampaignEntitlementInput {
  tier:
    string;

  channels:
    CommunicationChannel[];

  smartChanneling:
    boolean;

  fallbackPolicy:
    CommunicationFallbackPolicy;

  recipientCount:
    number;
}

//--------------------------------------------------
// Entitlement Result
//--------------------------------------------------

export interface CommunicationCampaignEntitlementResult {
  plan:
    CommunicationPlan;

  voiceRuntime:
    CommunicationVoiceRuntime;
}

//--------------------------------------------------
// Validate Complete Campaign Entitlement
//--------------------------------------------------

export function assertCommunicationCampaignEntitlements(
  input:
    CommunicationCampaignEntitlementInput
): CommunicationCampaignEntitlementResult {
  const plan =
    getCommunicationPlanForTier(
      input.tier
    );

  //------------------------------------------------
  // Subscription Snapshot Must Match
  //------------------------------------------------

  const normalizedTier =
    input
      .tier
      .trim()
      .toUpperCase();

  if (
    normalizedTier !==
      "STANDARD" &&
    normalizedTier !==
      "PREMIUM"
  ) {
    throw new Error(
      "Communication campaign has an invalid subscription tier"
    );
  }

  //------------------------------------------------
  // SMS
  //------------------------------------------------

  if (
    input.channels.includes(
      CommunicationChannel.SMS
    ) &&
    !plan.features.sms
  ) {
    throw new Error(
      `${plan.label} does not include SMS`
    );
  }

  //------------------------------------------------
  // WhatsApp
  //------------------------------------------------

  if (
    input.channels.includes(
      CommunicationChannel.WHATSAPP
    ) &&
    !plan.features.whatsapp
  ) {
    throw new Error(
      `${plan.label} does not include WhatsApp`
    );
  }

  //------------------------------------------------
  // AI Voice
  //------------------------------------------------

  if (
    input.channels.includes(
      CommunicationChannel.AI_VOICE
    ) &&
    !plan.features.aiVoice
  ) {
    throw new Error(
      `${plan.label} does not include AI Voice`
    );
  }

  //------------------------------------------------
  // IVR
  //------------------------------------------------

  if (
    input.channels.includes(
      CommunicationChannel.IVR
    ) &&
    !plan.features.ivr
  ) {
    throw new Error(
      `${plan.label} does not include IVR`
    );
  }

  //------------------------------------------------
  // Smart Channeling
  //------------------------------------------------

  if (
    input.smartChanneling &&
    !plan
      .features
      .smartChanneling
  ) {
    throw new Error(
      "Smart Channeling requires the Premium communication plan"
    );
  }

  //------------------------------------------------
  // Fallback
  //------------------------------------------------

  assertFallbackEntitlement(
    plan,
    input.channels,
    input.fallbackPolicy
  );

  //------------------------------------------------
  // Single-Campaign Safety Limit
  //
  // M10 later adds aggregate daily usage tracking.
  // This guard prevents one campaign from exceeding
  // the tier's entire daily recipient allowance.
  //------------------------------------------------

  if (
    input.recipientCount >
    plan
      .limits
      .dailyRecipients
  ) {
    throw new Error(
      `${plan.label} supports a maximum of ${plan.limits.dailyRecipients.toLocaleString(
        "en-US"
      )} recipients per daily allowance`
    );
  }

  //------------------------------------------------
  // Result
  //------------------------------------------------

  return {
    plan,

    voiceRuntime:
      plan
        .voice
        .runtime,
  };
}

//--------------------------------------------------
// Fallback Entitlement
//--------------------------------------------------

function assertFallbackEntitlement(
  plan:
    CommunicationPlan,

  channels:
    CommunicationChannel[],

  fallbackPolicy:
    CommunicationFallbackPolicy
): void {
  //------------------------------------------------
  // No Fallback
  //------------------------------------------------

  if (
    fallbackPolicy ===
    CommunicationFallbackPolicy.NONE
  ) {
    return;
  }

  //------------------------------------------------
  // Premium Feature Required
  //------------------------------------------------

  if (
    !plan
      .features
      .omnichannelFallback
  ) {
    throw new Error(
      "Omnichannel fallback requires the Premium communication plan"
    );
  }

  //------------------------------------------------
  // WhatsApp -> SMS
  //------------------------------------------------

  if (
    fallbackPolicy ===
    CommunicationFallbackPolicy.WHATSAPP_TO_SMS
  ) {
    const hasWhatsApp =
      channels.includes(
        CommunicationChannel.WHATSAPP
      );

    const hasSms =
      channels.includes(
        CommunicationChannel.SMS
      );

    if (
      !hasWhatsApp ||
      !hasSms
    ) {
      throw new Error(
        "WhatsApp to SMS fallback requires both WhatsApp and SMS channels"
      );
    }

    return;
  }

  //------------------------------------------------
  // Full Omnichannel
  //
  // The enum exists but full behavioral routing is
  // not implemented yet. Fail closed instead of
  // pretending that the feature works.
  //------------------------------------------------

  if (
    fallbackPolicy ===
    CommunicationFallbackPolicy.OMNICHANNEL
  ) {
    throw new Error(
      "Full omnichannel fallback is not enabled in this release"
    );
  }

  throw new Error(
    "Unsupported communication fallback policy"
  );
}

//--------------------------------------------------
// Advanced Analytics
//--------------------------------------------------

export function canUseAdvancedCommunicationAnalytics(
  tier:
    string
): boolean {
  return getCommunicationPlanForTier(
    tier
  )
    .features
    .advancedAnalytics;
}

//--------------------------------------------------
// Human Transfer
//--------------------------------------------------

export function canUseCommunicationHumanTransfer(
  tier:
    string
): boolean {
  return getCommunicationPlanForTier(
    tier
  )
    .features
    .humanTransfer;
}

//--------------------------------------------------
// Smart Channeling
//--------------------------------------------------

export function canUseCommunicationSmartChanneling(
  tier:
    string
): boolean {
  return getCommunicationPlanForTier(
    tier
  )
    .features
    .smartChanneling;
}

//--------------------------------------------------
// Fallback
//--------------------------------------------------

export function canUseCommunicationFallback(
  tier:
    string
): boolean {
  return getCommunicationPlanForTier(
    tier
  )
    .features
    .omnichannelFallback;
}

//--------------------------------------------------
// Voice Runtime
//--------------------------------------------------

export function resolveCommunicationVoiceRuntime(
  tier:
    string
): CommunicationVoiceRuntime {
  return getCommunicationPlanForTier(
    tier
  )
    .voice
    .runtime;
}