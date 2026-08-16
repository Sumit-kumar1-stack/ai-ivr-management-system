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
// BullMQ Queue
//--------------------------------------------------

export const campaignQueue =
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

//--------------------------------------------------
// Campaign Queue Service
//--------------------------------------------------

export class CampaignQueueService {
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
      const job =
        await campaignQueue.add(
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

    return campaignQueue.getJob(
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
    await campaignQueue.close();
  }
}