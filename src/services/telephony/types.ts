export interface CallRequest {
  campaignId: string;

  campaignRunId?: string;

  contactId: string;

  /*
   * Phone number stored against the contact.
   */
  contactPhone: string;

  /*
   * Actual destination sent to the provider.
   */
  to: string;

  from: string;

  language: string;

  script: string;

  usedDevelopmentOverride?: boolean;

  destinationOverrideSource?: string;
}


export interface ProviderCallRequest
  extends CallRequest {
  callId: string;
}


export interface CallResponse {
  callId: string;

  providerCallId?: string;

  status: string;

  duplicate?: boolean;
}