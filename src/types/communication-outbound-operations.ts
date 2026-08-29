export type CanonicalOutboundDisposition =
  | "PENDING"
  | "QUEUED"
  | "REQUESTING"
  | "RINGING"
  | "ANSWERED"
  | "COMPLETED"
  | "BUSY"
  | "NO_ANSWER"
  | "REJECTED"
  | "INVALID_NUMBER"
  | "PROVIDER_ERROR"
  | "FAILED"
  | "CANCELED"
  | "TRANSFERRED"
  | "CALLBACK_REQUESTED"
  | "CALLBACK_COMPLETED";

export const OUTBOUND_REALTIME_EVENTS = {
  ATTEMPT_UPDATED: "outbound.attempt.updated",
  DISPOSITION_UPDATED: "outbound.disposition.updated",
  RETRY_SCHEDULED: "outbound.retry.scheduled",
  TRANSFER_UPDATED: "outbound.transfer.updated",
  CALLBACK_UPDATED: "outbound.callback.updated",
  PROGRESS_UPDATED: "campaign.progress.updated",
  CAMPAIGN_COMPLETED: "campaign.completed",
} as const;

export type OutboundRealtimeEvent =
  (typeof OUTBOUND_REALTIME_EVENTS)[keyof typeof OUTBOUND_REALTIME_EVENTS];

export type OutboundRetryVisibility =
  | "NONE"
  | "SCHEDULED"
  | "EXHAUSTED";

export interface CommunicationOutboundProgressDTO {
  totalRecipients: number;
  pending: number;
  queued: number;
  requesting: number;
  ringing: number;
  answered: number;
  completed: number;
  busy: number;
  noAnswer: number;
  rejected: number;
  invalidNumber: number;
  providerError: number;
  failed: number;
  canceled: number;
  retryScheduled: number;
  transferred: number;
  callbackRequested: number;
  callbackCompleted: number;
  terminalCount: number;
  processedCount: number;
  remainingCount: number;
  progressPercent: number;
}

export interface CommunicationOutboundAttemptSummaryDTO {
  id: string;
  recipientId: string;
  recipient: string;
  attemptNumber: number;
  state: CanonicalOutboundDisposition;
  disposition: CanonicalOutboundDisposition;
  retryState: OutboundRetryVisibility;
  nextRetryAt: string | null;
  queuedAt: string;
  ringingAt: string | null;
  answeredAt: string | null;
  completedAt: string | null;
  transferred: boolean;
  callbackRequested: boolean;
  callbackCompleted: boolean;
  updatedAt: string;
}

export interface CommunicationOutboundOperationsDTO {
  progress: CommunicationOutboundProgressDTO;
  attempts: CommunicationOutboundAttemptSummaryDTO[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
