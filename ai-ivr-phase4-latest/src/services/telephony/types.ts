//--------------------------------------------------
// Outbound Workflow Purpose
//--------------------------------------------------

export type CallWorkflowPurpose =
  | "GENERAL"
  | "REMINDER"
  | "CALLBACK"
  | "FOLLOW_UP";

//--------------------------------------------------
// Call Request
//--------------------------------------------------

export interface CallRequest {
  campaignId:
    string;

  campaignRunId?:
    string;

  contactId:
    string;

  /*
   * Phone number stored against the contact.
   */
  contactPhone:
    string;

  /*
   * Actual destination submitted to provider.
   */
  to:
    string;

  from:
    string;

  language:
    string;

  /*
   * Initial spoken content / campaign opening.
   */
  script:
    string;

  /*
   * Semantic reason for the outbound call.
   */
  workflowPurpose?:
    CallWorkflowPurpose;

  /*
   * Provider-neutral AI instruction associated
   * with this outbound workflow.
   */
  workflowInstruction?:
    string;

  usedDevelopmentOverride?:
    boolean;

  destinationOverrideSource?:
    string;

  //------------------------------------------------
  // Retry Metadata
  //------------------------------------------------

  attemptNumber?:
    number;

  maxAttempts?:
    number;

  retryOfCallId?:
    string;

  retryReason?:
    string;
}

//--------------------------------------------------
// Provider Call Request
//--------------------------------------------------

export interface ProviderCallRequest
  extends CallRequest {
  /*
   * Internal database Call ID.
   *
   * Providers use this ID in webhook URLs so
   * callbacks can locate the correct Call record.
   */
  callId:
    string;
}

//--------------------------------------------------
// Call Response
//--------------------------------------------------

export interface CallResponse {
  /*
   * Internal database Call ID.
   */
  callId:
    string;

  /*
   * Provider-side identifier such as
   * a Twilio Call SID.
   */
  providerCallId?:
    string;

  status:
    string;

  /*
   * True when the same
   * campaign-run/contact/attempt already existed
   * and no second provider request was made.
   */
  duplicate?:
    boolean;

  attemptNumber?:
    number;
}