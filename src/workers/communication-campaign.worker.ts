import {
  Job,
  Worker,
} from "bullmq";

import {
  getCommunicationPlan,
} from "@/config/communication-plan";

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  redisConnection,
} from "@/lib/redis";

import {
  COMMUNICATION_FALLBACK_JOB_NAME,
  COMMUNICATION_JOB_NAME,
  COMMUNICATION_QUEUE_NAME,
  type CommunicationCampaignJobData,
  type CommunicationFallbackJobData,
  type CommunicationJobData,
} from "@/services/communication/communication-campaign-queue.service";

import {
  runCommunicationCampaign,
} from "@/services/communication/communication-campaign-runner.service";

import {
  handleWhatsAppFailureFallback,
} from "@/services/communication/communication-fallback.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "communication-campaign-worker"
  );

//--------------------------------------------------
// Worker State
//--------------------------------------------------

let worker:
  Worker<
    CommunicationJobData,
    unknown
  > |
  null =
    null;

//--------------------------------------------------
// Initialize
//--------------------------------------------------

export function initializeCommunicationCampaignWorker():
  Worker<
    CommunicationJobData,
    unknown
  > {
  if (
    worker
  ) {
    return worker;
  }

  const concurrency =
    getConcurrency();

  const plan =
    getCommunicationPlan();

  log.info(
    {
      event:
        "communication.worker.initializing",

      tier:
        plan.tier,

      concurrency,

      planConcurrencyLimit:
        plan
          .limits
          .campaignConcurrency,
    },
    "Initializing communication campaign worker"
  );

  worker =
    new Worker<
      CommunicationJobData,
      unknown
    >(
      COMMUNICATION_QUEUE_NAME,

      async (
        job:
          Job<
            CommunicationJobData,
            unknown
          >
      ) => {
        //------------------------------------------------
        // Communication Campaign
        //------------------------------------------------

        if (
          job.name ===
          COMMUNICATION_JOB_NAME
        ) {
          const data =
            job.data as
              CommunicationCampaignJobData;

          const campaignId =
            data
              .communicationCampaignId
              ?.trim();

          if (
            !campaignId
          ) {
            throw new Error(
              "Communication campaign job is missing communicationCampaignId"
            );
          }

          await job
            .updateProgress(
              0
            );

          const result =
            await runCommunicationCampaign(
              campaignId
            );

          await job
            .updateProgress(
              100
            );

          return result;
        }

        //------------------------------------------------
        // WhatsApp -> SMS Fallback
        //------------------------------------------------

        if (
          job.name ===
          COMMUNICATION_FALLBACK_JOB_NAME
        ) {
          const data =
            job.data as
              CommunicationFallbackJobData;

          const outboundMessageId =
            data
              .outboundMessageId
              ?.trim();

          if (
            !outboundMessageId
          ) {
            throw new Error(
              "Communication fallback job is missing outboundMessageId"
            );
          }

          const result =
            await handleWhatsAppFailureFallback(
              outboundMessageId
            );

          await job
            .updateProgress(
              100
            );

          return result;
        }

        //------------------------------------------------
        // Unsupported
        //------------------------------------------------

        throw new Error(
          `Unsupported communication job: ${job.name}`
        );
      },

      {
        connection:
          redisConnection,

        concurrency,
      }
    );

  //------------------------------------------------
  // Worker Failure
  //------------------------------------------------

  worker.on(
    "failed",
    (
      job,
      error
    ) => {
      log.error(
        {
          event:
            "communication.worker.job_failed",

          jobId:
            job?.id,

          jobName:
            job?.name,

          error:
            normalizeError(
              error
            ),
        },
        "Communication worker job failed"
      );
    }
  );

  return worker;
}

//--------------------------------------------------
// Close
//--------------------------------------------------

export async function closeCommunicationCampaignWorker():
  Promise<void> {
  if (
    !worker
  ) {
    return;
  }

  const current =
    worker;

  worker =
    null;

  await current.close();
}

//--------------------------------------------------
// Concurrency
//
// The environment value may LOWER concurrency for
// operational reasons, but it may never raise the
// worker above the subscription plan entitlement.
//--------------------------------------------------

function getConcurrency():
  number {
  const plan =
    getCommunicationPlan();

  const planLimit =
    Math.max(
      1,
      Math.round(
        plan
          .limits
          .campaignConcurrency
      )
    );

  const configuredRaw =
    process.env
      .COMMUNICATION_CAMPAIGN_CONCURRENCY
      ?.trim();

  if (
    !configuredRaw
  ) {
    return planLimit;
  }

  const configured =
    Number(
      configuredRaw
    );

  if (
    !Number.isFinite(
      configured
    )
  ) {
    return planLimit;
  }

  return Math.max(
    1,
    Math.min(
      planLimit,
      Math.round(
        configured
      )
    )
  );
}