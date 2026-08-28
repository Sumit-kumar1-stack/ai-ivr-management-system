import {
  orchestrateOutboundCampaignLaunch,
} from "./communication-outbound-orchestrator.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface RunCommunicationCampaignResult {
  communicationCampaignId:
    string;

  recipientCount:
    number;

  messagingAccepted:
    number;

  messagingFailed:
    number;

  smsDeferredForFallback:
    number;

  aiVoiceQueued:
    boolean;

  ivrQueued:
    boolean;

  voiceQueued:
    boolean;

  voiceCampaignId:
    string | null;

  ivrCampaignId:
    string | null;

  voiceErrors:
    string[];
}

//--------------------------------------------------
// Run
//--------------------------------------------------

export async function runCommunicationCampaign(
  communicationCampaignId:
    string
): Promise<RunCommunicationCampaignResult> {
  const result =
    await orchestrateOutboundCampaignLaunch({
      campaignId:
        communicationCampaignId,

      tenantId:
        "",

      requestedByUserId:
        "",

      now:
        new Date(),
    });

  return {
    communicationCampaignId:
      result.communicationCampaignId,

    recipientCount:
      result.audienceCount,

    messagingAccepted:
      result.queuedCount,

    messagingFailed:
      result.excludedCount,

    smsDeferredForFallback:
      result.deferredCount,

    aiVoiceQueued:
      false,

    ivrQueued:
      false,

    voiceQueued:
      false,

    voiceCampaignId:
      null,

    ivrCampaignId:
      null,

    voiceErrors:
      [],
  };
}
