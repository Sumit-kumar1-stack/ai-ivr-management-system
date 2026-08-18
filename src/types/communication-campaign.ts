//--------------------------------------------------
// Communication Tier
//--------------------------------------------------

export type CommunicationTier =
  | "STANDARD"
  | "PREMIUM";

//--------------------------------------------------
// Communication Channel
//--------------------------------------------------

export type CommunicationChannel =
  | "SMS"
  | "WHATSAPP"
  | "AI_VOICE"
  | "IVR";

//--------------------------------------------------
// Fallback Policy
//--------------------------------------------------

export type CommunicationFallbackPolicy =
  | "NONE"
  | "WHATSAPP_TO_SMS"
  | "OMNICHANNEL";

//--------------------------------------------------
// Campaign Status
//--------------------------------------------------

export type CommunicationCampaignStatus =
  | "DRAFT"
  | "READY"
  | "SCHEDULED"
  | "QUEUED"
  | "RUNNING"
  | "DISPATCHED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

//--------------------------------------------------
// Campaign DTO
//--------------------------------------------------

export interface CommunicationCampaignDTO {
  id:
    string;

  name:
    string;

  audienceSourceId:
    string | null;

  audienceSourceName:
    string;

  recipientCount:
    number;

  tier:
    CommunicationTier;

  channels:
    CommunicationChannel[];

  smartChanneling:
    boolean;

  fallbackPolicy:
    CommunicationFallbackPolicy;

  status:
    CommunicationCampaignStatus;

  launchImmediately:
    boolean;

  scheduledAt:
    string | null;

  //------------------------------------------------
  // AI Voice
  //------------------------------------------------

  voiceCampaignId:
    string | null;

  //------------------------------------------------
  // Classic IVR
  //------------------------------------------------

  ivrCampaignId:
    string | null;

  ivrFlowId:
    string | null;

  ivrRuntimeFlowId:
    string | null;

  //------------------------------------------------
  // Timestamps
  //------------------------------------------------

  createdAt:
    string;

  updatedAt:
    string;
}