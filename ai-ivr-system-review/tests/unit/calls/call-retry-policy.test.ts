import {
  CallStatus,
} from "@prisma/client";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getCallRetryDecision,
} from "@/services/calls/call-retry-policy";

//--------------------------------------------------
// Constants Used By The Policy
//--------------------------------------------------

const MINUTE =
  60 * 1000;

describe(
  "getCallRetryDecision",
  () => {
    //------------------------------------------------
    // Maximum Attempts
    //------------------------------------------------

    it(
      "does not retry when the maximum attempts have been reached",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.BUSY,

            attemptNumber:
              3,

            maxAttempts:
              3,
          });

        expect(
          result
        ).toEqual({
          shouldRetry:
            false,

          delayMs:
            0,

          reason:
            "Maximum retry attempts reached",
        });
      }
    );

    it(
      "does not retry when attempt number is greater than maximum attempts",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.FAILED,

            attemptNumber:
              4,

            maxAttempts:
              3,
          });

        expect(
          result.shouldRetry
        ).toBe(
          false
        );

        expect(
          result.delayMs
        ).toBe(
          0
        );

        expect(
          result.reason
        ).toBe(
          "Maximum retry attempts reached"
        );
      }
    );

    //------------------------------------------------
    // Busy
    //------------------------------------------------

    it(
      "retries a busy call after 30 minutes",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.BUSY,

            attemptNumber:
              1,

            maxAttempts:
              3,
          });

        expect(
          result
        ).toEqual({
          shouldRetry:
            true,

          delayMs:
            30 *
            MINUTE,

          reason:
            "Contact line was busy",
        });
      }
    );

    //------------------------------------------------
    // No Answer
    //------------------------------------------------

    it(
      "retries a no-answer call after 2 hours",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.NO_ANSWER,

            attemptNumber:
              1,

            maxAttempts:
              3,
          });

        expect(
          result
        ).toEqual({
          shouldRetry:
            true,

          delayMs:
            120 *
            MINUTE,

          reason:
            "Contact did not answer",
        });
      }
    );

    //------------------------------------------------
    // Provider Failure Backoff
    //------------------------------------------------

    it(
      "retries the first failed attempt after 5 minutes",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.FAILED,

            attemptNumber:
              1,

            maxAttempts:
              3,
          });

        expect(
          result
        ).toEqual({
          shouldRetry:
            true,

          delayMs:
            5 *
            MINUTE,

          reason:
            "Temporary provider or call failure",
        });
      }
    );

    it(
      "retries the second failed attempt after 10 minutes",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.FAILED,

            attemptNumber:
              2,

            maxAttempts:
              3,
          });

        expect(
          result
        ).toEqual({
          shouldRetry:
            true,

          delayMs:
            10 *
            MINUTE,

          reason:
            "Temporary provider or call failure",
        });
      }
    );

    it(
      "applies exponential backoff to later failed attempts when allowed",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.FAILED,

            attemptNumber:
              3,

            maxAttempts:
              5,
          });

        expect(
          result.shouldRetry
        ).toBe(
          true
        );

        expect(
          result.delayMs
        ).toBe(
          20 *
          MINUTE
        );
      }
    );

    //------------------------------------------------
    // Successful Or Cancelled Calls
    //------------------------------------------------

    it(
      "does not retry a completed call",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.COMPLETED,

            attemptNumber:
              1,

            maxAttempts:
              3,
          });

        expect(
          result
        ).toEqual({
          shouldRetry:
            false,

          delayMs:
            0,

          reason:
            "Call completed successfully",
        });
      }
    );

    it(
      "does not retry a canceled call",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.CANCELED,

            attemptNumber:
              1,

            maxAttempts:
              3,
          });

        expect(
          result
        ).toEqual({
          shouldRetry:
            false,

          delayMs:
            0,

          reason:
            "Call was canceled",
        });
      }
    );

    //------------------------------------------------
    // Non-Terminal Statuses
    //------------------------------------------------

    it.each([
      CallStatus.QUEUED,
      CallStatus.RINGING,
      CallStatus.ANSWERED,
    ])(
      "does not retry non-terminal status %s",
      status => {
        const result =
          getCallRetryDecision({
            status,

            attemptNumber:
              1,

            maxAttempts:
              3,
          });

        expect(
          result
        ).toEqual({
          shouldRetry:
            false,

          delayMs:
            0,

          reason:
            "Call has not reached a retryable terminal state",
        });
      }
    );

    //------------------------------------------------
    // Precedence
    //------------------------------------------------

    it(
      "checks maximum attempts before status-specific retry rules",
      () => {
        const result =
          getCallRetryDecision({
            status:
              CallStatus.NO_ANSWER,

            attemptNumber:
              2,

            maxAttempts:
              2,
          });

        expect(
          result.reason
        ).toBe(
          "Maximum retry attempts reached"
        );

        expect(
          result.shouldRetry
        ).toBe(
          false
        );
      }
    );
  }
);