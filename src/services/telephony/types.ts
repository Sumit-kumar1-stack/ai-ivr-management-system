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

  /*
   * Retry metadata.
   *
   * Initial calls use attemptNumber 1.
   * Retried calls use attemptNumber 2 or 3.
   */
  attemptNumber?: number;

  maxAttempts?: number;

  /*
   * ID of the call that caused this retry attempt.
   */
  retryOfCallId?: string;

  /*
   * Human-readable reason for retrying.
   *
   * Examples:
   * - Contact line was busy
   * - Contact did not answer
   * - Temporary provider failure
   */
  retryReason?: string;
}

export interface ProviderCallRequest
  extends CallRequest {
  /*
   * Internal database Call ID.
   *
   * Providers use this ID in webhook URLs so
   * callbacks can locate the correct Call record.
   */
  callId: string;
}

export interface CallResponse {
  /*
   * Internal database Call ID.
   */
  callId: string;

  /*
   * Provider-side call identifier, such as
   * a Twilio Call SID.
   */
  providerCallId?: string;

  status: string;

  /*
   * True when the same campaign-run/contact/attempt
   * already existed and no second provider request
   * was made.
   */
  duplicate?: boolean;

  attemptNumber?: number;
}