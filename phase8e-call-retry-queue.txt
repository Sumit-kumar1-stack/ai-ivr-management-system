import {
  Queue,
} from "bullmq";

import {
  redisConnection,
} from "@/lib/redis";

//--------------------------------------------------
// Queue Constants
//--------------------------------------------------

export const CALL_RETRY_QUEUE_NAME =
  "call-retry-processing";

export const CALL_RETRY_JOB_NAME =
  "retry-call";

//--------------------------------------------------
// Retry Job Data
//--------------------------------------------------

export interface CallRetryJobData {
  originalCallId: string;

  campaignId: string;

  campaignRunId: string;

  contactId: string;

  attemptNumber: number;

  maxAttempts: number;

  retryReason: string;
}

//--------------------------------------------------
// BullMQ Queue
//--------------------------------------------------

export const callRetryQueue =
  new Queue<CallRetryJobData>(
    CALL_RETRY_QUEUE_NAME,
    {
      connection:
        redisConnection,

      defaultJobOptions: {
        attempts:
          3,

        backoff: {
          type:
            "exponential",

          delay:
            5_000,
        },

        removeOnComplete: {
          age:
            24 * 60 * 60,

          count:
            1_000,
        },

        removeOnFail: {
          age:
            7 * 24 * 60 * 60,

          count:
            5_000,
        },
      },
    }
  );

//--------------------------------------------------
// Retry Queue Service
//--------------------------------------------------

export class CallRetryQueueService {
  static async enqueue(
    data: CallRetryJobData,
    delayMs: number
  ) {
    const jobId =
      buildRetryJobId(
        data.originalCallId,
        data.attemptNumber
      );

    const existingJob =
      await callRetryQueue.getJob(
        jobId
      );

    if (existingJob) {
      return existingJob;
    }

    return callRetryQueue.add(
      CALL_RETRY_JOB_NAME,
      data,
      {
        jobId,

        delay:
          Math.max(
            delayMs,
            0
          ),
      }
    );
  }

  static async getJob(
    originalCallId: string,
    attemptNumber: number
  ) {
    return callRetryQueue.getJob(
      buildRetryJobId(
        originalCallId,
        attemptNumber
      )
    );
  }

  static async close():
    Promise<void> {
    await callRetryQueue.close();
  }
}

//--------------------------------------------------
// Build Retry Job ID
//--------------------------------------------------

function buildRetryJobId(
  originalCallId: string,
  attemptNumber: number
): string {
  return [
    "call-retry",
    originalCallId,
    `attempt-${attemptNumber}`,
  ].join("-");
}