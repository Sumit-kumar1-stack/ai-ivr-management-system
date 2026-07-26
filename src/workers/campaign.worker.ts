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
  createWorkerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

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
// Logger
//--------------------------------------------------

const log =
  createWorkerLogger(
    "campaign-worker",
    {
      queue:
        CAMPAIGN_QUEUE_NAME,
    }
  );

//--------------------------------------------------
// Job Timing
//--------------------------------------------------

const jobStartedTimes =
  new Map<
    string,
    bigint
  >();

//--------------------------------------------------
// Worker State
//--------------------------------------------------

let campaignWorker:
  | Worker<
      CampaignJobData,
      RunCampaignResult
    >
  | null =
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
    log.debug(
      {
        event:
          "campaign.worker.initialize.skipped",

        reason:
          "already_initialized",
      },
      "Campaign worker is already initialized"
    );

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

        const startedAt =
          process.hrtime.bigint();

        if (
          job.id
        ) {
          jobStartedTimes.set(
            String(
              job.id
            ),
            startedAt
          );
        }

        const jobLog =
          createWorkerLogger(
            "campaign-worker",
            {
              queue:
                CAMPAIGN_QUEUE_NAME,

              jobId:
                job.id,

              jobName:
                job.name,

              campaignId,

              campaignRunId,

              bullAttempt:
                job.attemptsMade +
                1,
            }
          );

        jobLog.info(
          {
            event:
              "campaign.job.processing.started",
          },
          "Campaign worker started processing job"
        );

        if (
          job.name !==
          CAMPAIGN_JOB_NAME
        ) {
          throw new Error(
            `Unsupported campaign job: ${job.name}`
          );
        }

        try {
          const result =
            await runCampaign(
              campaignId,
              campaignRunId
            );

          await job.updateProgress(
            100
          );

          jobLog.info(
            {
              event:
                "campaign.job.processing.completed",

              durationMs:
                getDurationMs(
                  startedAt
                ),

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
            },
            "Campaign job processing completed"
          );

          return result;
        } catch (
          error
        ) {
          jobLog.error(
            {
              event:
                "campaign.job.processing.failed",

              durationMs:
                getDurationMs(
                  startedAt
                ),

              error:
                normalizeError(
                  error
                ),
            },
            "Campaign job processing failed"
          );

          throw error;
        }
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
      log.info(
        {
          event:
            "campaign.worker.ready",

          concurrency,
        },
        "Campaign worker is ready"
      );
    }
  );

  //------------------------------------------------
  // Job Active
  //------------------------------------------------

  campaignWorker.on(
    "active",
    job => {
      const jobId =
        String(
          job.id ??
          ""
        );

      if (
        jobId &&
        !jobStartedTimes.has(
          jobId
        )
      ) {
        jobStartedTimes.set(
          jobId,
          process.hrtime.bigint()
        );
      }

      log.info(
        {
          event:
            "campaign.job.active",

          jobId:
            job.id,

          campaignId:
            job.data.campaignId,

          campaignRunId:
            job.data.campaignRunId,

          bullAttempt:
            job.attemptsMade +
            1,
        },
        "Campaign job became active"
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
      log.debug(
        {
          event:
            "campaign.job.progress",

          jobId:
            job.id,

          campaignId:
            job.data.campaignId,

          campaignRunId:
            job.data.campaignRunId,

          progress,
        },
        "Campaign job progress updated"
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
      const jobId =
        String(
          job.id ??
          ""
        );

      const startedAt =
        jobId
          ? jobStartedTimes.get(
              jobId
            )
          : undefined;

      if (
        jobId
      ) {
        jobStartedTimes.delete(
          jobId
        );
      }

      log.info(
        {
          event:
            "campaign.job.completed",

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

          durationMs:
            startedAt
              ? getDurationMs(
                  startedAt
                )
              : undefined,
        },
        "Campaign job completed"
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
      const jobId =
        String(
          job?.id ??
          ""
        );

      const startedAt =
        jobId
          ? jobStartedTimes.get(
              jobId
            )
          : undefined;

      if (
        jobId
      ) {
        jobStartedTimes.delete(
          jobId
        );
      }

      log.error(
        {
          event:
            "campaign.job.failed",

          jobId:
            job?.id,

          campaignId:
            job?.data.campaignId,

          campaignRunId:
            job?.data.campaignRunId,

          attemptsMade:
            job?.attemptsMade,

          attemptsAllowed:
            job?.opts.attempts ??
            1,

          durationMs:
            startedAt
              ? getDurationMs(
                  startedAt
                )
              : undefined,

          error:
            normalizeError(
              error
            ),
        },
        "Campaign job failed"
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
       * BullMQ may retry the job. Do not mark the
       * campaign permanently failed until all worker
       * attempts have been exhausted.
       */
      if (
        job.attemptsMade <
        attemptsAllowed
      ) {
        log.warn(
          {
            event:
              "campaign.job.retry_pending",

            jobId:
              job.id,

            campaignId:
              job.data.campaignId,

            campaignRunId:
              job.data.campaignRunId,

            attemptsMade:
              job.attemptsMade,

            attemptsAllowed,
          },
          "Campaign worker retry is still available"
        );

        return;
      }

      const completedAt =
        new Date();

      try {
        const [
          campaignRunResult,
          campaignResult,
        ] =
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

        log.warn(
          {
            event:
              "campaign.job.terminal_failure_persisted",

            jobId:
              job.id,

            campaignId:
              job.data.campaignId,

            campaignRunId:
              job.data.campaignRunId,

            campaignRunUpdated:
              campaignRunResult.count,

            campaignUpdated:
              campaignResult.count,

            completedAt:
              completedAt.toISOString(),
          },
          "Terminal campaign worker failure persisted"
        );
      } catch (
        persistenceError
      ) {
        log.error(
          {
            event:
              "campaign.job.terminal_failure_persistence_failed",

            jobId:
              job.id,

            campaignId:
              job.data.campaignId,

            campaignRunId:
              job.data.campaignRunId,

            error:
              normalizeError(
                persistenceError
              ),
          },
          "Failed to persist terminal campaign worker failure"
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
      log.error(
        {
          event:
            "campaign.worker.error",

          error:
            normalizeError(
              error
            ),
        },
        "Campaign worker error"
      );
    }
  );

  log.info(
    {
      event:
        "campaign.worker.initialized",

      concurrency,
    },
    "Campaign worker initialized"
  );

  return campaignWorker;
}

//--------------------------------------------------
// Get Existing Worker
//--------------------------------------------------

export function getCampaignWorker():
  | Worker<
      CampaignJobData,
      RunCampaignResult
    >
  | null {
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
    log.debug(
      {
        event:
          "campaign.worker.close.skipped",

        reason:
          "not_initialized",
      },
      "Campaign worker is not initialized"
    );

    return;
  }

  const startedAt =
    process.hrtime.bigint();

  log.info(
    {
      event:
        "campaign.worker.close.started",
    },
    "Campaign worker shutdown started"
  );

  await campaignWorker.close();

  campaignWorker =
    null;

  jobStartedTimes.clear();

  log.info(
    {
      event:
        "campaign.worker.close.completed",

      durationMs:
        getDurationMs(
          startedAt
        ),
    },
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
    log.warn(
      {
        event:
          "campaign.worker.invalid_concurrency",

        configuredValue:
          rawValue,

        fallbackValue:
          3,
      },
      "Invalid CAMPAIGN_CALL_CONCURRENCY; using default"
    );

    return 3;
  }

  return Math.min(
    parsedValue,
    20
  );
}