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
  type CampaignJobData,
} from "@/services/campaigns/campaign-queue.service";

import {
  runCampaign,
  type RunCampaignResult,
} from "@/services/campaigns/campaign-runner.service";

//--------------------------------------------------
// Constants
//--------------------------------------------------

const DEFAULT_CONCURRENCY =
  3;

const MAX_CONCURRENCY =
  20;

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
  //------------------------------------------------
  // Reuse Existing Worker
  //------------------------------------------------

  if (
    campaignWorker
  ) {
    return campaignWorker;
  }

  //------------------------------------------------
  // Resolve Concurrency
  //------------------------------------------------

  const concurrency =
    getWorkerConcurrency();

  //------------------------------------------------
  // Create BullMQ Worker
  //------------------------------------------------

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
        //------------------------------------------
        // Validate Job Type
        //------------------------------------------

        if (
          job.name !==
          CAMPAIGN_JOB_NAME
        ) {
          throw new Error(
            `Unsupported campaign job: ${job.name}`
          );
        }

        //------------------------------------------
        // Resolve Job Data
        //------------------------------------------

        const {
          campaignId,
          campaignRunId,
        } =
          job.data;

        //------------------------------------------
        // Validate Job Payload
        //------------------------------------------

        if (
          !campaignId
            ?.trim()
        ) {
          throw new Error(
            "Campaign job is missing campaignId"
          );
        }

        if (
          !campaignRunId
            ?.trim()
        ) {
          throw new Error(
            "Campaign job is missing campaignRunId"
          );
        }

        //------------------------------------------
        // Diagnostics
        //------------------------------------------

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

        //------------------------------------------
        // Initial Progress
        //------------------------------------------

        await job.updateProgress(
          0
        );

        //------------------------------------------
        // Run Campaign
        //------------------------------------------

        /*
         * campaign-runner.service.ts owns:
         *
         * - CampaignRun claiming
         * - Campaign RUNNING transition
         * - contact validation
         * - provider destination resolution
         * - outbound workflow resolution
         * - startCall()
         * - per-contact progress persistence
         * - campaign finalization
         *
         * The worker should not duplicate those
         * business rules.
         */
        const result =
          await runCampaign(
            campaignId,
            campaignRunId
          );

        //------------------------------------------
        // Final Progress
        //------------------------------------------

        await job.updateProgress(
          100
        );

        //------------------------------------------
        // Result
        //------------------------------------------

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

          jobName:
            job.name,

          campaignId:
            job.data
              .campaignId,

          campaignRunId:
            job.data
              .campaignRunId,

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

          campaignId:
            job.data
              .campaignId,

          campaignRunId:
            job.data
              .campaignRunId,

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
            result
              .campaignId,

          campaignRunId:
            result
              .campaignRunId,

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
      //------------------------------------------
      // Failure Log
      //------------------------------------------

      console.error(
        "Campaign job failed",
        {
          jobId:
            job?.id,

          campaignId:
            job?.data
              .campaignId,

          campaignRunId:
            job?.data
              .campaignRunId,

          attemptsMade:
            job
              ?.attemptsMade,

          attemptsAllowed:
            job
              ?.opts
              .attempts ??
            1,

          error:
            normalizeError(
              error
            ),
        }
      );

      //------------------------------------------
      // No Job Information
      //------------------------------------------

      if (
        !job
      ) {
        return;
      }

      //------------------------------------------
      // BullMQ Retry Check
      //------------------------------------------

      const attemptsAllowed =
        job.opts
          .attempts ??
        1;

      /*
       * BullMQ may retry the campaign job.
       *
       * Do not mark the database campaign/run
       * permanently FAILED while another BullMQ
       * execution attempt is still pending.
       */
      if (
        job.attemptsMade <
        attemptsAllowed
      ) {
        console.warn(
          "Campaign job will be retried",
          {
            jobId:
              job.id,

            campaignId:
              job.data
                .campaignId,

            campaignRunId:
              job.data
                .campaignRunId,

            attemptsMade:
              job.attemptsMade,

            attemptsAllowed,
          }
        );

        return;
      }

      //------------------------------------------
      // Final BullMQ Failure
      //------------------------------------------

      await persistTerminalWorkerFailure(
        job.data
      );
    }
  );

  //------------------------------------------------
  // Worker Error
  //------------------------------------------------

  campaignWorker.on(
    "error",
    error => {
      /*
       * Worker-level error does not necessarily
       * correspond to a specific campaign job.
       * Therefore no campaign database state is
       * changed from this event.
       */
      console.error(
        "Campaign worker error",
        normalizeError(
          error
        )
      );
    }
  );

  //------------------------------------------------
  // Worker Initialized
  //------------------------------------------------

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
// Persist Terminal Worker Failure
//--------------------------------------------------

async function persistTerminalWorkerFailure(
  data:
    CampaignJobData
): Promise<void> {
  const completedAt =
    new Date();

  try {
    await prisma.$transaction([
      //--------------------------------------------
      // Campaign Run
      //--------------------------------------------

      prisma
        .campaignRun
        .updateMany({
          where: {
            id:
              data
                .campaignRunId,

            campaignId:
              data
                .campaignId,

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

      //--------------------------------------------
      // Campaign
      //--------------------------------------------

      prisma
        .campaign
        .updateMany({
          where: {
            id:
              data
                .campaignId,

            /*
             * SCHEDULED is included because Phase 14
             * supports delayed BullMQ campaign jobs.
             *
             * Normally the runner moves the campaign
             * to RUNNING before execution; this also
             * protects failures that occur before that
             * transition can complete.
             */
            status: {
              in: [
                CampaignStatus.SCHEDULED,
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

    console.error(
      "Terminal campaign worker failure persisted",
      {
        campaignId:
          data.campaignId,

        campaignRunId:
          data.campaignRunId,

        completedAt:
          completedAt
            .toISOString(),
      }
    );
  } catch (
    persistenceError
  ) {
    /*
     * Do not throw from a BullMQ event listener.
     * The job is already terminally failed.
     */
    console.error(
      "Failed to persist terminal campaign worker failure",
      {
        campaignId:
          data
            .campaignId,

        campaignRunId:
          data
            .campaignRunId,

        error:
          normalizeError(
            persistenceError
          ),
      }
    );
  }
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

  //------------------------------------------------
  // Graceful BullMQ Shutdown
  //------------------------------------------------

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
      : DEFAULT_CONCURRENCY;

  //------------------------------------------------
  // Invalid Value
  //------------------------------------------------

  if (
    !Number.isInteger(
      parsedValue
    ) ||
    parsedValue <
      1
  ) {
    console.warn(
      `Invalid CAMPAIGN_CALL_CONCURRENCY; using ${DEFAULT_CONCURRENCY}`,
      {
        configuredValue:
          rawValue,
      }
    );

    return DEFAULT_CONCURRENCY;
  }

  //------------------------------------------------
  // Safety Cap
  //------------------------------------------------

  return Math.min(
    parsedValue,
    MAX_CONCURRENCY
  );
}

//--------------------------------------------------
// Normalize Error
//--------------------------------------------------

function normalizeError(
  error:
    unknown
): {
  name:
    string;

  message:
    string;

  code?:
    string |
    number;

  stack?:
    string;
} {
  if (
    error instanceof
    Error
  ) {
    const errorWithCode =
      error as
        Error & {
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
        errorWithCode
          .code,

      stack:
        error.stack,
    };
  }

  if (
    typeof error ===
    "string"
  ) {
    return {
      name:
        "Error",

      message:
        error,
    };
  }

  try {
    return {
      name:
        "UnknownError",

      message:
        JSON.stringify(
          error
        ),
    };
  } catch {
    return {
      name:
        "UnknownError",

      message:
        String(
          error
        ),
    };
  }
}