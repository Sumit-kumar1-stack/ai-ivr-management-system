export interface CallRequest {

  campaignId: string;

  contactId: string;

  to: string;

  from: string;

  script: string;

  language: string;

}

export interface CallResponse {

  callId: string;

  status: string;

}