import {
  Job,
  Worker,
} from "bullmq";

import {
  CampaignRunStatus,
  CampaignStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  redisConnection,
} from "@/lib/redis";

import {
  CAMPAIGN_JOB_NAME,
  CAMPAIGN_QUEUE_NAME,
  CampaignJobData,
} from "@/services/campaigns/campaign-queue.service";

import {
  runCampaign,
  RunCampaignResult,
} from "@/services/campaigns/campaign-runner.service";


//--------------------------------------------------
// Worker State
//--------------------------------------------------

let campaignWorker:
  Worker<
    CampaignJobData,
    RunCampaignResult
  > |
  null =
    null;


//--------------------------------------------------
// Initialize Worker
//--------------------------------------------------

export function initializeCampaignWorker():
  Worker<
    CampaignJobData,
    RunCampaignResult
  > {

  if (
    campaignWorker
  ) {

    return campaignWorker;

  }


  const concurrency =
    getWorkerConcurrency();


  campaignWorker =
    new Worker<
      CampaignJobData,
      RunCampaignResult
    >(
      CAMPAIGN_QUEUE_NAME,

      async (
        job:
          Job<
            CampaignJobData,
            RunCampaignResult
          >
      ): Promise<RunCampaignResult> => {

        const {
          campaignId,
          campaignRunId,
        } =
          job.data;


        console.log(
          "Campaign worker processing job",
          {
            jobId:
              job.id,

            jobName:
              job.name,

            campaignId,

            campaignRunId,

            attempt:
              job.attemptsMade +
              1,
          }
        );


        if (
          job.name !==
          CAMPAIGN_JOB_NAME
        ) {

          throw new Error(
            `Unsupported campaign job: ${job.name}`
          );

        }


        /*
         * The campaign runner now persists progress
         * after every contact internally.
         *
         * It accepts only campaignId and
         * campaignRunId.
         */
        const result =
          await runCampaign(
            campaignId,
            campaignRunId
          );


        await job.updateProgress(
          100
        );


        return result;

      },
      {
        connection:
          redisConnection,

        concurrency,
      }
    );


  //------------------------------------------------
  // Worker Ready
  //------------------------------------------------

  campaignWorker.on(
    "ready",
    () => {

      console.log(
        "Campaign worker ready",
        {
          queue:
            CAMPAIGN_QUEUE_NAME,

          concurrency,
        }
      );

    }
  );


  //------------------------------------------------
  // Job Active
  //------------------------------------------------

  campaignWorker.on(
    "active",
    job => {

      console.log(
        "Campaign job started",
        {
          jobId:
            job.id,

          campaignId:
            job.data.campaignId,

          campaignRunId:
            job.data.campaignRunId,

          attempt:
            job.attemptsMade +
            1,
        }
      );

    }
  );


  //------------------------------------------------
  // Job Progress
  //------------------------------------------------

  campaignWorker.on(
    "progress",
    (
      job,
      progress
    ) => {

      console.log(
        "Campaign job progress updated",
        {
          jobId:
            job.id,

          campaignRunId:
            job.data.campaignRunId,

          progress,
        }
      );

    }
  );


  //------------------------------------------------
  // Job Completed
  //------------------------------------------------

  campaignWorker.on(
    "completed",
    (
      job,
      result
    ) => {

      console.log(
        "Campaign job completed",
        {
          jobId:
            job.id,

          campaignId:
            result.campaignId,

          campaignRunId:
            result.campaignRunId,

          total:
            result.total,

          processed:
            result.processed,

          successful:
            result.successful,

          failed:
            result.failed,

          status:
            result.status,
        }
      );

    }
  );


  //------------------------------------------------
  // Job Failed
  //------------------------------------------------

  campaignWorker.on(
    "failed",
    async (
      job,
      error
    ) => {

      console.error(
        "Campaign job failed",
        {
          jobId:
            job?.id,

          campaignId:
            job?.data.campaignId,

          campaignRunId:
            job?.data.campaignRunId,

          attemptsMade:
            job?.attemptsMade,

          error: {
            name:
              error.name,

            message:
              error.message,

            stack:
              error.stack,
          },
        }
      );


      if (
        !job
      ) {

        return;

      }


      const attemptsAllowed =
        job.opts.attempts ??
        1;


      /*
       * Do not mark the campaign permanently failed
       * while BullMQ still has retries remaining.
       */
      if (
        job.attemptsMade <
        attemptsAllowed
      ) {

        return;

      }


      const completedAt =
        new Date();


      try {

        await prisma.$transaction([
          prisma.campaignRun.updateMany({
            where: {
              id:
                job.data
                  .campaignRunId,

              status: {
                in: [
                  CampaignRunStatus.QUEUED,
                  CampaignRunStatus.RUNNING,
                ],
              },
            },

            data: {
              status:
                CampaignRunStatus.FAILED,

              completedAt,
            },
          }),

          prisma.campaign.updateMany({
            where: {
              id:
                job.data
                  .campaignId,

              status: {
                in: [
                  CampaignStatus.QUEUED,
                  CampaignStatus.RUNNING,
                ],
              },
            },

            data: {
              status:
                CampaignStatus.FAILED,

              completedAt,
            },
          }),
        ]);

      } catch (
        persistenceError
      ) {

        console.error(
          "Failed to persist terminal campaign worker failure",
          {
            campaignId:
              job.data.campaignId,

            campaignRunId:
              job.data.campaignRunId,

            error:
              normalizeError(
                persistenceError
              ),
          }
        );

      }

    }
  );


  //------------------------------------------------
  // Worker Error
  //------------------------------------------------

  campaignWorker.on(
    "error",
    error => {

      console.error(
        "Campaign worker error",
        normalizeError(
          error
        )
      );

    }
  );


  console.log(
    "Campaign worker initialized",
    {
      queue:
        CAMPAIGN_QUEUE_NAME,

      concurrency,
    }
  );


  return campaignWorker;

}


//--------------------------------------------------
// Get Existing Worker
//--------------------------------------------------

export function getCampaignWorker():
  Worker<
    CampaignJobData,
    RunCampaignResult
  > |
  null {

  return campaignWorker;

}


//--------------------------------------------------
// Close Worker
//--------------------------------------------------

export async function closeCampaignWorker():
  Promise<void> {

  if (
    !campaignWorker
  ) {

    return;

  }


  await campaignWorker.close();


  campaignWorker =
    null;


  console.log(
    "Campaign worker closed"
  );

}


//--------------------------------------------------
// Worker Concurrency
//--------------------------------------------------

function getWorkerConcurrency():
  number {

  const rawValue =
    process.env
      .CAMPAIGN_CALL_CONCURRENCY
      ?.trim();


  const parsedValue =
    rawValue
      ? Number(
          rawValue
        )
      : 3;


  if (
    !Number.isInteger(
      parsedValue
    ) ||
    parsedValue <
      1
  ) {

    console.warn(
      "Invalid CAMPAIGN_CALL_CONCURRENCY; using 3",
      {
        configuredValue:
          rawValue,
      }
    );


    return 3;

  }


  return Math.min(
    parsedValue,
    20
  );

}


//--------------------------------------------------
// Normalize Error
//--------------------------------------------------

function normalizeError(
  error: unknown
) {

  if (
    error instanceof
    Error
  ) {

    const errorWithCode =
      error as Error & {
        code?:
          string |
          number;
      };


    return {
      name:
        error.name,

      message:
        error.message,

      code:
        errorWithCode.code,

      stack:
        error.stack,
    };

  }


  return {
    message:
      String(
        error
      ),
  };

}