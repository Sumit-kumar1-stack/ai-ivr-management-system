import {
  CommunicationCampaignStatus,
  CommunicationOutboundAttemptStatus,
  CommunicationRecipientStatus,
} from "@prisma/client";

import {
  isWithinBusinessHours,
  type BusinessHoursPolicy,
} from "@/services/telephony/agent-availability.service";

export type OutboundRetryDecisionKind = "RETRY" | "DO_NOT_RETRY" | "DEFER";

export interface OutboundRetryDecision {
  decision: OutboundRetryDecisionKind;
  reasonCode: string;
  nextAttemptNumber: number | null;
  scheduledFor: Date | null;
}

export function decideOutboundRetry(input: {
  attemptNumber: number;
  maxAttempts: number;
  outcome: CommunicationOutboundAttemptStatus;
  campaignStatus: CommunicationCampaignStatus;
  recipientStatus: CommunicationRecipientStatus;
  eligible: boolean;
  now: Date;
  businessHoursPolicy?: BusinessHoursPolicy | null;
}): OutboundRetryDecision {
  if (input.campaignStatus === CommunicationCampaignStatus.CANCELLED) {
    return noRetry("CAMPAIGN_CANCELLED");
  }
  if (!input.eligible) return noRetry("RECIPIENT_INELIGIBLE");
  if (
    input.recipientStatus === CommunicationRecipientStatus.COMPLETED ||
    input.recipientStatus === CommunicationRecipientStatus.FAILED ||
    input.recipientStatus === CommunicationRecipientStatus.SKIPPED
  ) {
    return noRetry("RECIPIENT_TERMINAL");
  }
  if (input.attemptNumber >= input.maxAttempts) return noRetry("MAX_ATTEMPTS_REACHED");
  if (!RETRYABLE_OUTCOMES.has(input.outcome)) {
    return noRetry(`OUTCOME_${input.outcome}_NOT_RETRYABLE`);
  }

  const nextAttemptNumber = input.attemptNumber + 1;
  const candidate = new Date(input.now.getTime() + retryDelayMs(input.outcome));
  const scheduledFor = input.businessHoursPolicy
    ? nextAllowedBusinessTime(input.businessHoursPolicy, candidate)
    : candidate;

  if (input.campaignStatus === CommunicationCampaignStatus.PAUSED) {
    return {
      decision: "DEFER",
      reasonCode: "CAMPAIGN_PAUSED",
      nextAttemptNumber,
      scheduledFor,
    };
  }

  const deferred = scheduledFor.getTime() !== candidate.getTime();
  return {
    decision: deferred ? "DEFER" : "RETRY",
    reasonCode: deferred ? "OUTSIDE_CALLING_HOURS" : `RETRY_${input.outcome}`,
    nextAttemptNumber,
    scheduledFor,
  };
}

const RETRYABLE_OUTCOMES = new Set<CommunicationOutboundAttemptStatus>([
  CommunicationOutboundAttemptStatus.BUSY,
  CommunicationOutboundAttemptStatus.NO_ANSWER,
  CommunicationOutboundAttemptStatus.FAILED,
  CommunicationOutboundAttemptStatus.PROVIDER_ERROR,
]);

function retryDelayMs(outcome: CommunicationOutboundAttemptStatus): number {
  if (outcome === CommunicationOutboundAttemptStatus.NO_ANSWER) return 15 * 60 * 1000;
  if (outcome === CommunicationOutboundAttemptStatus.FAILED) return 10 * 60 * 1000;
  return 5 * 60 * 1000;
}

function nextAllowedBusinessTime(policy: BusinessHoursPolicy, candidate: Date): Date {
  if (isWithinBusinessHours(policy, candidate)) return candidate;
  const cursor = new Date(candidate);
  cursor.setUTCSeconds(0, 0);

  for (let minute = 0; minute <= 8 * 24 * 60; minute += 1) {
    if (isWithinBusinessHours(policy, cursor)) return cursor;
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  return candidate;
}

function noRetry(reasonCode: string): OutboundRetryDecision {
  return {
    decision: "DO_NOT_RETRY",
    reasonCode,
    nextAttemptNumber: null,
    scheduledFor: null,
  };
}
