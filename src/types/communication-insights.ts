import type {
  CommunicationCampaignStatus,
  CommunicationChannel,
  CommunicationTier,
} from "@/types/communication-campaign";

//--------------------------------------------------
// Unified Channel Status
//--------------------------------------------------

export type UnifiedChannelStatus =
  | "NOT_SELECTED"
  | "NOT_STARTED"
  | "PROCESSING"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "RINGING"
  | "ANSWERED"
  | "COMPLETED"
  | "FAILED"
  | "BUSY"
  | "NO_ANSWER"
  | "CANCELED";

//--------------------------------------------------
// Recipient Overall Status
//--------------------------------------------------

export type CommunicationRecipientOverallStatus =
  | "PENDING"
  | "ACTIVE"
  | "REACHED"
  | "FAILED";

//--------------------------------------------------
// Recipient Channel Insight
//--------------------------------------------------

export interface RecipientChannelInsightDTO {
  selected:
    boolean;

  status:
    UnifiedChannelStatus;

  attempts:
    number;

  lastActivityAt:
    string | null;

  error:
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

  phoneMasked:
    string;

  language:
    string;

  overallStatus:
    CommunicationRecipientOverallStatus;

  fallbackUsed:
    boolean;

  lastActivityAt:
    string | null;

  channels: {
    SMS:
      RecipientChannelInsightDTO;

    WHATSAPP:
      RecipientChannelInsightDTO;

    AI_VOICE:
      RecipientChannelInsightDTO;

    IVR:
      RecipientChannelInsightDTO;
  };
}

//--------------------------------------------------
// Primary Metrics
//--------------------------------------------------

export interface CommunicationCampaignMetricsDTO {
  sent:
    number;

  delivered:
    number;

  opened:
    number;

  converted:
    number;

  dropped:
    number;

  bounced:
    number;

  unsubscribed:
    number;

  averageTimeToOpenSeconds:
    number | null;
}

//--------------------------------------------------
// Channel Mix
//--------------------------------------------------

export interface CommunicationChannelMixDTO {
  channel:
    CommunicationChannel;

  selected:
    boolean;

  attempts:
    number;

  successful:
    number;

  failed:
    number;

  successRate:
    number;

  averageDurationSeconds:
    number | null;
}

//--------------------------------------------------
// Campaign Insights
//--------------------------------------------------

export type CommunicationAnalyticsAccess =
  | "BASIC"
  | "ADVANCED";

//--------------------------------------------------
// Campaign Insights
//--------------------------------------------------

export interface CommunicationCampaignInsightsDTO {

  analyticsAccess:
    CommunicationAnalyticsAccess;
  campaign: {
    id:
      string;

    name:
      string;

    audienceSourceName:
      string;

    recipientCount:
      number;

    tier:
      CommunicationTier;

    status:
      CommunicationCampaignStatus;

    channels:
      CommunicationChannel[];

    scheduledAt:
      string | null;

    createdAt:
      string;

    voiceCampaignId:
      string | null;

    ivrCampaignId:
      string | null;

    ivrFlow: {
      id:
        string;

      name:
        string;

      version:
        number;
    } | null;
  };

  metrics:
    CommunicationCampaignMetricsDTO;

  channelMix:
    CommunicationChannelMixDTO[];

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

  refreshedAt:
    string;
}