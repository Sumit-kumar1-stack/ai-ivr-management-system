//--------------------------------------------------
// Communication Tier
//--------------------------------------------------

export type CommunicationTier =
  | "STANDARD"
  | "PREMIUM";

//--------------------------------------------------
// Voice Runtime
//--------------------------------------------------

export type CommunicationVoiceRuntime =
  | "CASCADED"
  | "GEMINI_LIVE";

//--------------------------------------------------
// Plan Feature Contract
//--------------------------------------------------

export interface CommunicationPlanFeatures {
  sms:
    boolean;

  whatsapp:
    boolean;

  aiVoice:
    boolean;

  ivr:
    boolean;

  humanTransfer:
    boolean;

  smartChanneling:
    boolean;

  advancedAnalytics:
    boolean;

  omnichannelFallback:
    boolean;
}

//--------------------------------------------------
// Voice Contract
//--------------------------------------------------

export interface CommunicationVoicePlan {
  runtime:
    CommunicationVoiceRuntime;

  displayName:
    string;

  realtime:
    boolean;

  nativeAudio:
    boolean;
}

//--------------------------------------------------
// Plan Limits
//--------------------------------------------------

export interface CommunicationPlanLimits {
  campaignConcurrency:
    number;

  dailyRecipients:
    number;
}

//--------------------------------------------------
// Communication Plan
//--------------------------------------------------

export interface CommunicationPlan {
  tier:
    CommunicationTier;

  label:
    string;

  description:
    string;

  features:
    CommunicationPlanFeatures;

  voice:
    CommunicationVoicePlan;

  limits:
    CommunicationPlanLimits;
}

//--------------------------------------------------
// Standard Plan
//--------------------------------------------------

export const STANDARD_PLAN:
  CommunicationPlan =
{
  tier:
    "STANDARD",

  label:
    "Standard Business Account",

  description:
    "Reliable multi-channel communication with intelligent AI voice automation.",

  features: {
    sms:
      true,

    whatsapp:
      true,

    aiVoice:
      true,

    ivr:
      true,

    humanTransfer:
      false,

    smartChanneling:
      false,

    advancedAnalytics:
      false,

    omnichannelFallback:
      false,
  },

  voice: {
    runtime:
      "CASCADED",

    displayName:
      "Standard Intelligent Voice",

    realtime:
      false,

    nativeAudio:
      false,
  },

  limits: {
    campaignConcurrency:
      2,

    dailyRecipients:
      5_000,
  },
};

//--------------------------------------------------
// Premium Plan
//--------------------------------------------------

export const PREMIUM_PLAN:
  CommunicationPlan =
{
  tier:
    "PREMIUM",

  label:
    "Premium Business Account",

  description:
    "Real-time conversational AI with advanced routing, fallback and analytics.",

  features: {
    sms:
      true,

    whatsapp:
      true,

    aiVoice:
      true,

    ivr:
      true,

    humanTransfer:
      true,

    smartChanneling:
      true,

    advancedAnalytics:
      true,

    omnichannelFallback:
      true,
  },

  voice: {
    runtime:
      "GEMINI_LIVE",

    displayName:
      "Premium Real-Time Voice",

    realtime:
      true,

    nativeAudio:
      true,
  },

  limits: {
    campaignConcurrency:
      10,

    dailyRecipients:
      100_000,
  },
};

//--------------------------------------------------
// Resolve Explicit Tier
//--------------------------------------------------

export function getCommunicationPlanForTier(
  tier:
    string |
    null |
    undefined
): CommunicationPlan {
  const normalizedTier =
    tier
      ?.trim()
      .toUpperCase();

  if (
    normalizedTier ===
    "PREMIUM"
  ) {
    return PREMIUM_PLAN;
  }

  //------------------------------------------------
  // Fail Closed
  //
  // Missing / invalid subscription state must never
  // silently grant Premium capabilities.
  //------------------------------------------------

  return STANDARD_PLAN;
}

//--------------------------------------------------
// Resolve Current Environment Plan
//--------------------------------------------------

export function getCommunicationPlan():
  CommunicationPlan {
  return getCommunicationPlanForTier(
    process.env
      .COMMUNICATION_TIER
  );
}

//--------------------------------------------------
// Voice Runtime
//--------------------------------------------------

export function getCommunicationVoiceRuntimeForTier(
  tier:
    string |
    null |
    undefined
): CommunicationVoiceRuntime {
  return getCommunicationPlanForTier(
    tier
  ).voice.runtime;
}

//--------------------------------------------------
// Premium
//--------------------------------------------------

export function isPremiumCommunicationTier(
  tier:
    string |
    null |
    undefined
): boolean {
  return (
    getCommunicationPlanForTier(
      tier
    ).tier ===
    "PREMIUM"
  );
}