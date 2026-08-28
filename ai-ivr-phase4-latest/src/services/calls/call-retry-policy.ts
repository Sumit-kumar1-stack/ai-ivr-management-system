import {
  CallStatus,
} from "@prisma/client";

//--------------------------------------------------
// Retry Decision
//--------------------------------------------------

export interface CallRetryDecision {
  shouldRetry: boolean;

  delayMs: number;

  reason: string | null;
}

//--------------------------------------------------
// Retry Delay Constants
//--------------------------------------------------

const MINUTE =
  60 * 1000;

const BUSY_RETRY_DELAY =
  30 * MINUTE;

const NO_ANSWER_RETRY_DELAY =
  2 * 60 * MINUTE;

const PROVIDER_FAILURE_BASE_DELAY =
  5 * MINUTE;

//--------------------------------------------------
// Resolve Retry Policy
//--------------------------------------------------

export function getCallRetryDecision(
  input: {
    status: CallStatus;

    attemptNumber: number;

    maxAttempts: number;
  }
): CallRetryDecision {
  //------------------------------------------------
  // Maximum Attempts Reached
  //------------------------------------------------

  if (
    input.attemptNumber >=
    input.maxAttempts
  ) {
    return {
      shouldRetry:
        false,

      delayMs:
        0,

      reason:
        "Maximum retry attempts reached",
    };
  }

  //------------------------------------------------
  // Status-Specific Retry Rules
  //------------------------------------------------

  switch (
    input.status
  ) {
    case CallStatus.BUSY:
      return {
        shouldRetry:
          true,

        delayMs:
          BUSY_RETRY_DELAY,

        reason:
          "Contact line was busy",
      };

    case CallStatus.NO_ANSWER:
      return {
        shouldRetry:
          true,

        delayMs:
          NO_ANSWER_RETRY_DELAY,

        reason:
          "Contact did not answer",
      };

    case CallStatus.FAILED:
      return {
        shouldRetry:
          true,

        delayMs:
          calculateFailureBackoff(
            input.attemptNumber
          ),

        reason:
          "Temporary provider or call failure",
      };

    case CallStatus.COMPLETED:
      return {
        shouldRetry:
          false,

        delayMs:
          0,

        reason:
          "Call completed successfully",
      };

    case CallStatus.CANCELED:
      return {
        shouldRetry:
          false,

        delayMs:
          0,

        reason:
          "Call was canceled",
      };

    case CallStatus.QUEUED:
    case CallStatus.RINGING:
    case CallStatus.ANSWERED:
      return {
        shouldRetry:
          false,

        delayMs:
          0,

        reason:
          "Call has not reached a retryable terminal state",
      };

    default:
      return {
        shouldRetry:
          false,

        delayMs:
          0,

        reason:
          "Unsupported retry status",
      };
  }
}

//--------------------------------------------------
// Provider Failure Exponential Backoff
//--------------------------------------------------

function calculateFailureBackoff(
  attemptNumber: number
): number {
  /*
   * Attempt 1 failure → 5 minutes
   * Attempt 2 failure → 10 minutes
   * Attempt 3 cannot retry because max is reached.
   */
  const exponent =
    Math.max(
      attemptNumber - 1,
      0
    );

  return (
    PROVIDER_FAILURE_BASE_DELAY *
    2 ** exponent
  );
}