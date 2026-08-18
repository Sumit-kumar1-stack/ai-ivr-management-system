import type {
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationFallbackPolicy,
  CommunicationTier,
} from "@/types/communication-campaign";

//--------------------------------------------------
// Unified Recipient Status
//--------------------------------------------------

export type CommunicationInsightStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CONVERTED";

//--------------------------------------------------
// Per-Channel Runtime Status
//--------------------------------------------------

export type CommunicationChannelRuntimeStatus =
  | "NOT_SELECTED"
  | "PENDING"
  | "PROCESSING"
  | "ACCEPTED"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "RINGING"
  | "ANSWERED"
  | "COMPLETED"
  | "FAILED"
  | "UNDELIVERED"
  | "BUSY"
  | "NO_ANSWER"
  | "CANCELED";

//--------------------------------------------------
// Recipient Channel State
//--------------------------------------------------

export interface CommunicationRecipientChannelState {
  selected:
    boolean;

  status:
    CommunicationChannelRuntimeStatus;

  attemptedAt:
    string | null;

  updatedAt:
    string | null;
}

//--------------------------------------------------
// Recipient Insight
//--------------------------------------------------

export interface CommunicationRecipientInsightDTO {
  id:
    string;

  externalRecipientId:
    string | null;

  fullName:
    string | null;

  phone:
    string;

  language:
    string;

  status:
    CommunicationInsightStatus;

  converted:
    boolean;

  lastError:
    string | null;

  lastActivityAt:
    string;

  channels: {
    SMS:
      CommunicationRecipientChannelState;

    WHATSAPP:
      CommunicationRecipientChannelState;

    AI_VOICE:
      CommunicationRecipientChannelState;

    IVR:
      CommunicationRecipientChannelState;
  };
}

//--------------------------------------------------
// Messaging Metrics
//--------------------------------------------------

export interface CommunicationMessagingChannelMetrics {
  attempted:
    number;

  dispatched:
    number;

  delivered:
    number;

  read:
    number;

  failed:
    number;

  deliveryRate:
    number;
}

//--------------------------------------------------
// Voice Metrics
//--------------------------------------------------

export interface CommunicationVoiceChannelMetrics {
  attempted:
    number;

  dispatched:
    number;

  answered:
    number;

  completed:
    number;

  failed:
    number;

  answerRate:
    number;

  averageDurationSeconds:
    number | null;
}

//--------------------------------------------------
// Campaign Details DTO
//--------------------------------------------------

export interface CommunicationCampaignDetailsDTO {
  campaign: {
    id:
      string;

    name:
      string;

    status:
      CommunicationCampaignStatus;

    tier:
      CommunicationTier;

    channels:
      CommunicationChannel[];

    fallbackPolicy:
      CommunicationFallbackPolicy;

    audienceSourceName:
      string;

    recipientCount:
      number;

    voiceCampaignId:
      string | null;

    ivrCampaignId:
      string | null;

    createdAt:
      string;

    updatedAt:
      string;
  };

  funnel: {
    sent:
      number;

    delivered:
      number;

    opened:
      number;

    converted:
      number;
  };

  secondaryMetrics: {
    dropped:
      number;

    bounced:
      number;

    unsubscribed:
      number;

    averageTimeToOpenMinutes:
      number | null;
  };

  channelMix: {
    SMS:
      CommunicationMessagingChannelMetrics;

    WHATSAPP:
      CommunicationMessagingChannelMetrics;

    AI_VOICE:
      CommunicationVoiceChannelMetrics;

    IVR:
      CommunicationVoiceChannelMetrics;
  };

  recipients:
    CommunicationRecipientInsightDTO[];

  pagination: {
    page:
      number;

    pageSize:
      number;

    total:
      number;

    totalPages:
      number;
  };

  generatedAt:
    string;
}