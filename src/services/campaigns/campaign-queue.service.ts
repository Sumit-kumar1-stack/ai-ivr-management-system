import {
  Queue,
} from "bullmq";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  redisConnection,
} from "@/lib/redis";

import {
  readQueueDiagnosticCounts,
} from "@/services/queues/queue-diagnostics.types";

//--------------------------------------------------
// Queue Constants
//--------------------------------------------------

export const CAMPAIGN_QUEUE_NAME =
  "campaign-processing";

export const CAMPAIGN_JOB_NAME =
  "run-campaign";

//--------------------------------------------------
// Limits
//--------------------------------------------------

const MAX_DELAY_MS =
  30 *
  24 *
  60 *
  60 *
  1000;

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "campaign-queue"
  );

//--------------------------------------------------
// Job Payload
//--------------------------------------------------

export interface CampaignJobData {
  campaignId:
    string;

  campaignRunId:
    string;
}

//--------------------------------------------------
// Enqueue Options
//--------------------------------------------------

export interface CampaignEnqueueOptions {
  delayMs?:
    number;
}

//--------------------------------------------------
// Queue State
//
// IMPORTANT:
//
// Do not construct BullMQ Queue at module import time.
// Next.js imports API route dependencies while running
// `next build`; constructing Queue there forces Redis to
// connect even though no queue operation is being made.
//--------------------------------------------------

let campaignQueue:
  Queue<CampaignJobData> |
  null =
    null;

//--------------------------------------------------
// Get Queue
//--------------------------------------------------

function getCampaignQueue():
  Queue<CampaignJobData> {
  if (
    campaignQueue
  ) {
    return campaignQueue;
  }

  campaignQueue =
    new Queue<CampaignJobData>(
      CAMPAIGN_QUEUE_NAME,
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

  return campaignQueue;
}

//--------------------------------------------------
// Build Safe BullMQ Job ID
//--------------------------------------------------

function buildCampaignJobId(
  campaignRunId:
    string
): string {
  return `campaign-run-${campaignRunId}`;
}

//--------------------------------------------------
// Normalize Delay
//--------------------------------------------------

function normalizeDelay(
  delayMs:
    number | undefined
): number {
  if (
    delayMs ===
      undefined ||
    !Number.isFinite(
      delayMs
    ) ||
    delayMs <=
      0
  ) {
    return 0;
  }

  return Math.min(
    Math.floor(
      delayMs
    ),
    MAX_DELAY_MS
  );
}

//--------------------------------------------------
// Campaign Queue Service
//--------------------------------------------------

export class CampaignQueueService {
  //------------------------------------------------
  // Read-Only Diagnostics
  //------------------------------------------------

  static async getReadOnlyCounts() {
    return readQueueDiagnosticCounts(
      getCampaignQueue()
    );
  }

  //------------------------------------------------
  // Enqueue
  //------------------------------------------------

  static async enqueue(
    data:
      CampaignJobData,

    options:
      CampaignEnqueueOptions =
      {}
  ) {
    const jobId =
      buildCampaignJobId(
        data.campaignRunId
      );

    const delayMs =
      normalizeDelay(
        options.delayMs
      );

    log.info(
      {
        event:
          "campaign.queue.enqueue_started",

        campaignId:
          data.campaignId,

        campaignRunId:
          data.campaignRunId,

        jobId,

        delayed:
          delayMs >
          0,

        delayMs,
      },
      "Adding campaign job"
    );

    try {
      const queue =
        getCampaignQueue();

      const job =
        await queue.add(
          CAMPAIGN_JOB_NAME,
          data,
          {
            /*
             * Prevent duplicate BullMQ jobs for
             * the same database campaign run.
             */
            jobId,

            delay:
              delayMs,
          }
        );

      log.info(
        {
          event:
            "campaign.queue.enqueued",

          jobId:
            job.id,

          campaignId:
            data.campaignId,

          campaignRunId:
            data.campaignRunId,

          delayed:
            delayMs >
            0,

          delayMs,
        },
        "Campaign job added"
      );

      return job;
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "campaign.queue.enqueue_failed",

          campaignId:
            data.campaignId,

          campaignRunId:
            data.campaignRunId,

          jobId,

          delayMs,

          error:
            normalizeError(
              error
            ),
        },
        "BullMQ campaign enqueue failed"
      );

      throw error;
    }
  }

  //------------------------------------------------
  // Get Job
  //------------------------------------------------

  static async getJob(
    campaignRunId:
      string
  ) {
    const jobId =
      buildCampaignJobId(
        campaignRunId
      );

    const queue =
      getCampaignQueue();

    return queue.getJob(
      jobId
    );
  }

  //------------------------------------------------
  // Remove Job
  //------------------------------------------------

  static async removeJob(
    campaignRunId:
      string
  ): Promise<boolean> {
    const job =
      await this.getJob(
        campaignRunId
      );

    if (
      !job
    ) {
      return false;
    }

    await job.remove();

    return true;
  }

  //------------------------------------------------
  // Close
  //------------------------------------------------

  static async close():
    Promise<void> {
    const queue =
      campaignQueue;

    campaignQueue =
      null;

    /*
     * Do not instantiate a queue merely to close it.
     * A process that never used campaign queueing should
     * finish without opening a Redis connection.
     */
    if (
      !queue
    ) {
      return;
    }

    await queue.close();
  }
}
