import type {
  CommunicationVoiceRuntime,
} from "@/config/communication-plan";

import {
  resolveCommunicationVoiceRuntime,
} from "./communication-entitlement.service";

import {
  startCommunicationPremiumVoiceCampaign,
  startCommunicationVoiceCampaign,
  type CommunicationVoiceBridgeResult,
} from "./communication-voice-bridge.service";

//--------------------------------------------------
// Runtime Input
//--------------------------------------------------

export interface StartCommunicationVoiceRuntimeInput {
  communicationCampaignId:
    string;

  tier:
    string;
}

//--------------------------------------------------
// Runtime Result
//--------------------------------------------------

export interface CommunicationVoiceRuntimeResult
  extends CommunicationVoiceBridgeResult {
  runtime:
    CommunicationVoiceRuntime;
}

//--------------------------------------------------
// Start Voice Runtime
//--------------------------------------------------

export async function startCommunicationVoiceRuntime(
  input:
    StartCommunicationVoiceRuntimeInput
): Promise<CommunicationVoiceRuntimeResult> {
  const communicationCampaignId =
    input
      .communicationCampaignId
      .trim();

  if (
    !communicationCampaignId
  ) {
    throw new Error(
      "Communication campaign ID is required for voice runtime"
    );
  }

  //------------------------------------------------
  // Resolve Runtime From Persisted Tier Snapshot
  //------------------------------------------------

  const runtime =
    resolveCommunicationVoiceRuntime(
      input.tier
    );

  //------------------------------------------------
  // Standard — Existing Cascaded Runtime
  //------------------------------------------------

  if (
    runtime ===
    "CASCADED"
  ) {
    const result =
      await startCommunicationVoiceCampaign(
        communicationCampaignId
      );

    return {
      runtime,

      ...result,
    };
  }

  //------------------------------------------------
  // Premium — Gemini Live
  //
  // Runtime selection is now explicit.
  // The actual Gemini Live adapter is connected in
  // the next M10 window.
  //------------------------------------------------

if (
  runtime ===
  "GEMINI_LIVE"
) {
  const result =
    await startCommunicationPremiumVoiceCampaign(
      communicationCampaignId
    );

  return {
    runtime,

    ...result,
  };
}

  //------------------------------------------------
  // Exhaustive Safety
  //------------------------------------------------

  return assertNeverRuntime(
    runtime
  );
}

//--------------------------------------------------
// Exhaustive Runtime Guard
//--------------------------------------------------

function assertNeverRuntime(
  runtime:
    never
): never {
  throw new Error(
    `Unsupported communication voice runtime: ${String(
      runtime
    )}`
  );
}