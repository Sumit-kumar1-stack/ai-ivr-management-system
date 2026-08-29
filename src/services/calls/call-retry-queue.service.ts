import {
  type Job,
  Queue,
} from "bullmq";

import {
  redisConnection,
} from "@/lib/redis";

import {
  readQueueDiagnosticCounts,
} from "@/services/queues/queue-diagnostics.types";

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
// Queue State
//--------------------------------------------------

let callRetryQueue:
  Queue<CallRetryJobData> |
  null =
    null;

//--------------------------------------------------
// Get Retry Queue
//--------------------------------------------------

function getCallRetryQueue():
  Queue<CallRetryJobData> {
  if (
    callRetryQueue
  ) {
    return callRetryQueue;
  }

  callRetryQueue =
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
              24 *
              60 *
              60,

            count:
              1_000,
          },

          removeOnFail: {
            age:
              7 *
              24 *
              60 *
              60,

            count:
              5_000,
          },
        },
      }
    );

  return callRetryQueue;
}

//--------------------------------------------------
// Retry Queue Service
//--------------------------------------------------

export class CallRetryQueueService {
  static async getReadOnlyCounts() {
    return readQueueDiagnosticCounts(
      getCallRetryQueue()
    );
  }

  static async enqueue(
    data:
      CallRetryJobData,

    delayMs:
      number
  ): Promise<
    Job<
      CallRetryJobData,
      unknown,
      string
    >
  > {
    const jobId =
      buildRetryJobId(
        data.originalCallId,
        data.attemptNumber
      );

    const queue =
      getCallRetryQueue();

    const existingJob =
      await queue.getJob(
        jobId
      );

    if (
      existingJob
    ) {
      return existingJob;
    }

    return queue.add(
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
    originalCallId:
      string,

    attemptNumber:
      number
  ): Promise<
    Job<
      CallRetryJobData,
      unknown,
      string
    > |
    undefined
  > {
    const queue =
      getCallRetryQueue();

    return queue.getJob(
      buildRetryJobId(
        originalCallId,
        attemptNumber
      )
    );
  }

  static async close():
    Promise<void> {
    const queue =
      callRetryQueue;

    callRetryQueue =
      null;

    /*
     * Do not create a queue merely to close it.
     * This prevents shutdown and build-time imports
     * from opening unnecessary Redis connections.
     */
    if (
      !queue
    ) {
      return;
    }

    await queue.close();
  }
}

//--------------------------------------------------
// Build Retry Job ID
//--------------------------------------------------

function buildRetryJobId(
  originalCallId:
    string,

  attemptNumber:
    number
): string {
  return [
    "call-retry",
    originalCallId,
    `attempt-${attemptNumber}`,
  ].join(
    "-"
  );
}
