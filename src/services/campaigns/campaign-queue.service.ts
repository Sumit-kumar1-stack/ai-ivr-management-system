import {
  Queue,
} from "bullmq";

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
// Job Payload
//--------------------------------------------------

export interface CampaignJobData {
  campaignId: string;

  campaignRunId: string;
}


//--------------------------------------------------
// Build Safe BullMQ Job ID
//--------------------------------------------------

function buildCampaignJobId(
  campaignRunId: string
): string {

  return `campaign-run-${campaignRunId}`;

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
// Campaign Queue Service
//--------------------------------------------------

export class CampaignQueueService {

  static async enqueue(
    data: CampaignJobData
  ) {

    const jobId =
      buildCampaignJobId(
        data.campaignRunId
      );


    console.info(
      "Adding campaign job",
      {
        campaignId:
          data.campaignId,

        campaignRunId:
          data.campaignRunId,

        jobId,
      }
    );


    try {

      const job =
        await campaignQueue.add(
          CAMPAIGN_JOB_NAME,
          data,
          {
            /*
             * Prevent duplicate jobs for the same
             * campaign run.
             */
            jobId,
          }
        );


      console.info(
        "Campaign job added",
        {
          jobId:
            job.id,

          campaignId:
            data.campaignId,

          campaignRunId:
            data.campaignRunId,
        }
      );


      return job;

    } catch (error) {

      console.error(
        "BullMQ campaign enqueue failed",
        {
          campaignId:
            data.campaignId,

          campaignRunId:
            data.campaignRunId,

          jobId,

          error:
            error instanceof Error
              ? {
                  name:
                    error.name,

                  message:
                    error.message,

                  stack:
                    error.stack,
                }
              : error,
        }
      );


      throw error;

    }

  }


  static async getJob(
    campaignRunId: string
  ) {

    const jobId =
      buildCampaignJobId(
        campaignRunId
      );


    return campaignQueue.getJob(
      jobId
    );

  }


  static async removeJob(
    campaignRunId: string
  ): Promise<boolean> {

    const job =
      await this.getJob(
        campaignRunId
      );


    if (!job) {

      return false;

    }


    await job.remove();


    return true;

  }


  static async close():
    Promise<void> {

    await campaignQueue.close();

  }

}