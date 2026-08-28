export interface OutboundProviderCallRequest {
  tenantId: string;
  campaignId: string;
  campaignRecipientId: string;
  attemptId: string;
  attemptNumber: number;
  provider: string;
  from: string;
  to: string;
  answerUrl: string;
  statusCallbackUrl: string;
  recordingCallbackUrl?: string | null;
}

export interface OutboundProviderCallResult {
  accepted: boolean;
  provider: string;
  providerRequestId: string | null;
  providerCallId: string | null;
  rawProviderStatus: string | null;
}
