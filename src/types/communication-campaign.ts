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

export interface CommunicationCampaignPermissions {
  canEdit: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRequestChanges: boolean;
  selfApprovalBlocked: boolean;
  canLaunch: boolean;
  canDelete: boolean;
  canArchive: boolean;
}

//--------------------------------------------------
// Campaign Status
//--------------------------------------------------

export type CommunicationCampaignStatus =
  | "DRAFT"
  | "READY"
  | "SCHEDULED"
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "DISPATCHED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "ARCHIVED";

//--------------------------------------------------
// Approval Status
//--------------------------------------------------

export type CommunicationCampaignApprovalStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED";

//--------------------------------------------------
// Campaign DTO
//--------------------------------------------------

export interface CommunicationCampaignDTO {
  id:
    string;

  name:
    string;

  description:
    string | null;

  prompt:
    string | null;

  knowledgeDocumentIds:
    string[];

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

  approvalRequired:
    boolean;

  approvalStatus:
    CommunicationCampaignApprovalStatus;

  submittedByUserId:
    string | null;

  submittedAt:
    string | null;

  approvedByUserId:
    string | null;

  approvedAt:
    string | null;

  approvalReason:
    string | null;

  permissions?:
    CommunicationCampaignPermissions;

  currentRevision:
    number;

  approvedRevision:
    number | null;

  attemptedContactCount:
    number;

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

  archivedAt:
    string | null;

  archivedByUserId:
    string | null;
}
